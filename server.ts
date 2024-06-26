import express from "express";
import { DeviceSession, DeviceSessionInput } from "./prover";
import { Identifiers } from "./identifiers";
import { PrivateKey, UInt64 } from "o1js";
import { client } from "drm-mina-chain";

let isCompiled = false;
const senderKey = PrivateKey.random();
const sender = senderKey.toPublicKey();
let nonce = 0;
(async () => {
    console.log("Compiling DeviceSession");
    await client.start();
    await DeviceSession.compile();
    isCompiled = true;
    console.log("DeviceSession compiled");
})();

const app = express();
app.use(express.json());

app.post("/", async (req, res) => {
    if (!isCompiled) {
        res.status(102).send("DeviceSession not compiled yet");
        return;
    }
    try {
        const { rawIdentifiers, currentSession, newSession, gameId } = req.body;
        const identifiers = Identifiers.fromRaw(rawIdentifiers);
        const publicInput = new DeviceSessionInput({
            gameId: UInt64.from(gameId),
            currentSessionKey: UInt64.from(currentSession),
            newSessionKey: UInt64.from(newSession),
        });
        const proof = await DeviceSession.proofForSession(publicInput, identifiers);

        const drm = client.runtime.resolve("DRM");

        const tx = await client.transaction(sender, () => {
            // @ts-ignore
            drm.createSession(proof);
        });

        tx.transaction!.nonce = UInt64.from(nonce);
        tx.transaction = tx.transaction?.sign(senderKey);
        await tx.send();

        console.log("Transaction sent");
        nonce++;

        res.status(200).send("Transaction sent");
    } catch (e) {
        console.error(e);
        res.status(500).send("Transaction failed");
    }
});

app.listen(4444, () => {
    console.log("Server started on port 4444");
});
