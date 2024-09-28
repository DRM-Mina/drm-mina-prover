import { DeviceSession, DeviceSessionInput, Identifiers } from "drm-mina-contracts";
import express from "express";
import { UInt64 } from "o1js";

const apiEndpoint =
    process.env.NODE_ENV === "production" ? "https://drm-mina.com" : "http://localhost:3333/";

let isCompiled = false;
(async () => {
    console.log("Compiling DeviceSession");
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

        const response = await fetch(`${apiEndpoint}/submit-session`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                proof: JSON.stringify(proof.toJSON()),
            }),
        });

        if (!response.ok) {
            throw new Error(`Failed to submit session: ${response.status}`);
        }
        res.status(200).send("Transaction sent");
    } catch (e) {
        console.error(e);
        res.status(500).send("Transaction failed");
    }
});

app.listen(4444, () => {
    console.log("Server started on port 4444");
});
