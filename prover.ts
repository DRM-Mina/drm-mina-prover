import { Experimental, Field, Struct, UInt64 } from "o1js";
import { Identifiers } from "./identifiers";

export class DeviceSessionInput extends Struct({
    gameId: UInt64,
    currentSessionKey: UInt64,
    newSessionKey: UInt64,
}) {}

export class DeviceSessionOutput extends Struct({
    gameId: UInt64,
    newSessionKey: UInt64,
    hash: Field,
}) {}

export const DeviceSession = Experimental.ZkProgram({
    name: "DeviceSession",
    publicInput: DeviceSessionInput,
    publicOutput: DeviceSessionOutput,
    methods: {
        proofForSession: {
            privateInputs: [Identifiers],
            method(publicInput: DeviceSessionInput, identifiers: Identifiers) {
                const identifiersHash = identifiers.hash();
                const newSessionKey = publicInput.newSessionKey;
                const gameId = publicInput.gameId;

                return {
                    gameId: gameId,
                    newSessionKey: newSessionKey,
                    hash: identifiersHash,
                };
            },
        },
    },
});
