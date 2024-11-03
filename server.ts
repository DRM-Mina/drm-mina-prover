import axios from "axios";
import { DRM, offchainState } from "drm-mina-contracts/build/src/DRM.js";
import { Identifiers } from "drm-mina-contracts/build/src/lib/DeviceIdentifier.js";
import {
    DeviceSession,
    DeviceSessionInput,
} from "drm-mina-contracts/build/src/lib/DeviceSessionProof.js";
import express from "express";
import { fetchAccount, Field, Mina, PublicKey, UInt64 } from "o1js";

const drmAddress = process.argv[2];
const gameTokenAddress = process.argv[3];

console.log("DRM address", drmAddress);
console.log("Game token address", gameTokenAddress);
if (!drmAddress) {
    console.error("DRM address is required");
    process.exit(1);
}

if (!gameTokenAddress) {
    console.error("Game token address is required");
    process.exit(1);
}

let isDeviceSessionCompiled = false;
let isOffChainStateCompiled = false;
let drmInstance: DRM | undefined;

(async () => {
    console.time("Compiling DeviceSession");
    await DeviceSession.compile();
    isDeviceSessionCompiled = true;
    console.timeEnd("Compiling DeviceSession");

    const Network = Mina.Network({
        mina: "https://api.minascan.io/node/devnet/v1/graphql",
        archive: "https://api.minascan.io/archive/devnet/v1/graphql",
    });
    Mina.setActiveInstance(Network);

    console.time("Compile OffchainState");
    drmInstance = new DRM(PublicKey.fromBase58(drmAddress));
    drmInstance.offchainState.setContractInstance(drmInstance);
    await offchainState.compile();
    isOffChainStateCompiled = true;
    console.timeEnd("Compile OffchainState");
})();

const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
    if (!isDeviceSessionCompiled) {
        res.status(102).send("DeviceSession not compiled yet");
        return;
    }
    try {
        const { rawIdentifiers, currentSession, newSession } = req.body;
        console.log(rawIdentifiers, currentSession, newSession);
        const identifiers = Identifiers.fromRaw(rawIdentifiers);
        const publicInput = new DeviceSessionInput({
            gameToken: PublicKey.fromBase58(gameTokenAddress),
            currentSessionKey: UInt64.from(currentSession),
            newSessionKey: UInt64.from(newSession),
        });
        console.log("Generating proof");
        const proof = await DeviceSession.proofForSession(publicInput, identifiers);

        console.log("Proof generated");
        const response = await axios.post("http://api_drmmina.kadircan.org/submit-session", {
            proof: JSON.stringify(proof.toJSON()),
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

app.post("/current-session", async (req, res) => {
    if (!isOffChainStateCompiled) {
        res.status(102).send("OffChainState not compiled yet");
        return;
    }

    try {
        const { deviceHash } = req.body;

        console.log(deviceHash);

        await fetchAccount({
            publicKey: PublicKey.fromBase58(drmAddress),
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
        res.status(500).send("Transaction failed");
        return;
    }
});

app.listen(4444, () => {
    console.log("Server started on port 4444");
});
