#!/usr/bin/env node

import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeFrame, FrameDecoder } from "./index.ts";
import type { DecoderEvent } from "./index.ts";

function usage(): string {
  return [
    "Usage:",
    "  framevault encode <input-file> <output-file>",
    "  framevault decode <input-file> <output-directory>",
    "",
    "The decode command honors FRAMEVAULT_MAX_PAYLOAD_LENGTH when set."
  ].join("\n");
}

function parseMaxPayloadLength(): number | undefined {
  const raw = process.env.FRAMEVAULT_MAX_PAYLOAD_LENGTH;
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }

  if (!/^\d+$/.test(raw)) {
    throw new Error("FRAMEVAULT_MAX_PAYLOAD_LENGTH must be a non-negative integer");
  }

  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error("FRAMEVAULT_MAX_PAYLOAD_LENGTH must be between 0 and 4294967295");
  }

  return value;
}

function printDecodeEvent(event: DecoderEvent, outputDirectory: string, frameNumber: number): Promise<number> {
  if (event.type === "error") {
    console.error(`[framevault] decode error: ${event.error.message}`);
    return Promise.resolve(frameNumber);
  }

  const nextFrameNumber = frameNumber + 1;
  const outputName = `frame-${String(nextFrameNumber).padStart(6, "0")}.bin`;
  const outputPath = join(outputDirectory, outputName);

  return writeFile(outputPath, event.frame.payload).then(() => {
    console.log(
      `[framevault] decoded ${outputName} (${event.frame.payload.byteLength} bytes, version ${event.frame.version}, flags ${event.frame.flags})`
    );
    return nextFrameNumber;
  });
}

async function encodeCommand(inputPath: string, outputPath: string): Promise<void> {
  const payload = await readFile(inputPath);
  const encoded = encodeFrame(payload);
  await writeFile(outputPath, encoded);
  console.log(`[framevault] encoded ${payload.byteLength} payload bytes into ${outputPath}`);
}

async function decodeCommand(inputPath: string, outputDirectory: string): Promise<void> {
  await mkdir(outputDirectory, { recursive: true });
  const maxPayloadLength = parseMaxPayloadLength();
  const decoder = maxPayloadLength === undefined
    ? new FrameDecoder()
    : new FrameDecoder({ maxPayloadLength });
  let frameNumber = 0;
  let errorCount = 0;

  const handleEvents = async (events: DecoderEvent[]): Promise<void> => {
    for (const event of events) {
      if (event.type === "error") {
        errorCount += 1;
      }
      frameNumber = await printDecodeEvent(event, outputDirectory, frameNumber);
    }
  };

  for await (const chunk of createReadStream(inputPath)) {
    await handleEvents(decoder.push(chunk));
  }
  await handleEvents(decoder.end());

  console.log(`[framevault] decoded ${frameNumber} valid frame(s)`);
  if (errorCount > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const [command, inputPath, outputPath] = process.argv.slice(2);

  if (command === "encode" && inputPath !== undefined && outputPath !== undefined) {
    await encodeCommand(inputPath, outputPath);
    return;
  }

  if (command === "decode" && inputPath !== undefined && outputPath !== undefined) {
    await decodeCommand(inputPath, outputPath);
    return;
  }

  console.error(usage());
  process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[framevault] ${message}`);
  process.exitCode = 1;
});

