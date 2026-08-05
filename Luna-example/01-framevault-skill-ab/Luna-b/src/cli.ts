#!/usr/bin/env node

import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { FrameDecoder, encodeFrame, type DecodeEvent } from './index.ts';

const USAGE = [
  'Usage:',
  '  framevault encode <input-file> <output-file>',
  '  framevault decode <input-file> <output-directory>'
].join('\n');

function reportError(event: Extract<DecodeEvent, { readonly type: 'error' }>): void {
  console.error(`FrameVault decode error: ${event.error.message}`);
}

async function encodeCommand(inputFile: string, outputFile: string): Promise<number> {
  const input = await readFile(inputFile);
  await writeFile(outputFile, encodeFrame(input));
  console.log(`Encoded ${input.byteLength} payload bytes to ${outputFile}.`);
  return 0;
}

async function decodeCommand(inputFile: string, outputDirectory: string): Promise<number> {
  await mkdir(outputDirectory, { recursive: true });

  const decoder = new FrameDecoder();
  let frameCount = 0;
  let errorCount = 0;
  const stream = createReadStream(inputFile, { highWaterMark: 64 * 1024 });

  const handleEvents = async (events: readonly DecodeEvent[]): Promise<void> => {
    for (const event of events) {
      if (event.type === 'error') {
        errorCount += 1;
        reportError(event);
        continue;
      }

      frameCount += 1;
      const outputFile = join(
        outputDirectory,
        `frame-${String(frameCount).padStart(4, '0')}.bin`
      );
      await writeFile(outputFile, event.frame.payload);
      console.log(`Decoded frame ${frameCount} (${event.frame.payload.byteLength} payload bytes) to ${outputFile}.`);
    }
  };

  for await (const chunk of stream) {
    await handleEvents(decoder.push(chunk));
  }
  await handleEvents(decoder.finish());

  console.log(`Decoded ${frameCount} valid frame(s); reported ${errorCount} error(s).`);
  return errorCount === 0 ? 0 : 1;
}

async function main(args: readonly string[]): Promise<number> {
  const command = args[0];
  const inputFile = args[1];
  const outputPath = args[2];

  if (!command || !inputFile || !outputPath || args.length !== 3) {
    console.error(USAGE);
    return 2;
  }

  if (command === 'encode') {
    return encodeCommand(inputFile, outputPath);
  }
  if (command === 'decode') {
    return decodeCommand(inputFile, outputPath);
  }

  console.error(`Unknown command: ${command}`);
  console.error(USAGE);
  return 2;
}

void main(process.argv.slice(2)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
);
