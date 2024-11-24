import { DRM, offchainState } from "drm-mina-contracts/build/src/DRM.js";
import { Identifiers } from "drm-mina-contracts/build/src/lib/DeviceIdentifier.js";
import {
    DeviceSession,
    DeviceSessionInput,
} from "drm-mina-contracts/build/src/lib/DeviceSessionProof.js";

import { fetchAccount, Field, Mina, PublicKey, UInt64 } from "o1js";

import axios from "axios";
import express from "express";

let drmAddress: PublicKey | undefined;
let gameTokenAddress: PublicKey | undefined;

let isDeviceSessionCompiled = false;
let isOffChainStateCompiled = false;
let drmInstance: DRM | undefined;

const setMinaNetwork = () => {
    const Network = Mina.Network({
        mina: "https://api.minascan.io/node/devnet/v1/graphql",
        archive: "https://api.minascan.io/archive/devnet/v1/graphql",
    });
    Mina.setActiveInstance(Network);
};

const compilePrograms = async () => {
    console.time("Compiling DeviceSession");
    await DeviceSession.compile();
    isDeviceSessionCompiled = true;
    console.timeEnd("Compiling DeviceSession");

    console.time("Compiling OffchainState");
    await offchainState.compile();
    isOffChainStateCompiled = true;
    console.timeEnd("Compiling OffchainState");
};

const setDRMInstance = () => {
    if (!drmAddress) {
        throw new Error("DRM address is required");
    }
    drmInstance = new DRM(drmAddress);
    drmInstance.offchainState.setContractInstance(drmInstance);
};

setMinaNetwork();
compilePrograms();

const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
    if (!isDeviceSessionCompiled) {
        res.status(102).send("DeviceSession not compiled yet");
        return;
    }
    if (!gameTokenAddress) {
        res.status(400).send("Game token address not set yet");
        return;
    }
    try {
        const { rawIdentifiers, currentSession, newSession } = req.body;
        console.log(currentSession, " -> ", newSession);
        const identifiers = Identifiers.fromRaw(rawIdentifiers);
        const publicInput = new DeviceSessionInput({
            gameToken: gameTokenAddress,
            currentSessionKey: UInt64.from(currentSession),
            newSessionKey: UInt64.from(newSession),
        });
        console.log("Generating proof");
        const proof = await DeviceSession.proofForSession(publicInput, identifiers);

        const response = await axios.post("http://api.drmmina.com/submit-session", {
            proof: JSON.stringify(proof.proof.toJSON()),
        });

        if (response.status !== 200) {
            throw new Error(`Failed to submit session: ${response.status}`);
        }

        console.log("Transaction sent");
        return res.status(200).send("Transaction sent");
    } catch (e) {
        console.error(e);
        return res.status(500).send("Transaction failed");
    }
});

app.post("/set-address", async (req, res) => {
    try {
        const { drmAddressB58, gameTokenAddressB58 } = req.body;
        console.log("DRM address", drmAddressB58);
        console.log("Game token address", gameTokenAddressB58);

        if (!drmAddressB58) {
            console.error("DRM address is required");
            res.status(400).send("DRM address is required");
            return;
        }

        if (!gameTokenAddressB58) {
            console.error("Game token address is required");
            res.status(400).send("Game token address is required");
            return;
        }

        try {
            drmAddress = PublicKey.fromBase58(drmAddressB58);
            gameTokenAddress = PublicKey.fromBase58(gameTokenAddressB58);
        } catch (e) {
            console.error(e);
            res.status(400).send("Invalid address");
            return;
        }

        setDRMInstance();
        res.status(200).send("Address set successfully");
        return;
    } catch (e) {
        console.error(e);
        res.status(500).send("Address setting failed");
    }
});

app.post("/current-session", async (req, res) => {
    if (!isOffChainStateCompiled) {
        res.status(102).send("OffChainState not compiled yet");
        return;
    }
    if (!drmAddress) {
        res.status(400).send("DRM address not set yet");
        return;
    }
    if (!drmInstance) {
        res.status(400).send("DRM instance not set yet");
        return;
    }

    try {
        const { deviceHash } = req.body;

        console.log(deviceHash);

        await fetchAccount({
            publicKey: drmAddress,
        });

        const currentSession = await drmInstance!.offchainState.fields.sessions.get(
            Field.from(deviceHash)
        );
        if (!currentSession.isSome.toBoolean()) {
            console.log("Current session not found");
            res.status(200).send({ currentSession: 0 });
        } else {
            console.log("Current session", currentSession.value.toString());
            res.status(200).send({ currentSession: currentSession.value.toString() });
        }
    } catch (e) {
        console.error(e);
        res.status(500).send("Current session fetch failed");
        return;
    }
});

app.listen(4444, () => {
    console.log("Server started on port 4444");
});
