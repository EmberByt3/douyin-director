import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config } from '../server/config.js';
import { extractAudio, extractFrames } from '../server/ffmpeg.js';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'director-synthetic-media-'));
try {
 const videoPath=path.join(dir,'synthetic.mp4'),audioPath=path.join(dir,'audio.wav'),framesDir=path.join(dir,'frames');
 execFileSync(config.ffmpegPath,['-y','-f','lavfi','-i','color=c=blue:s=128x128:r=25:d=2','-f','lavfi','-i','anullsrc=r=16000:cl=mono','-shortest','-c:v','mpeg4','-c:a','aac',videoPath],{stdio:'ignore',windowsHide:true});
 await extractAudio({videoPath,audioPath});await extractFrames({videoPath,framesDir,frameRateFps:5});
 assert((await fs.stat(audioPath)).size>1000);assert.equal((await fs.readdir(framesDir)).length,10);
 console.log('Synthetic FFmpeg integration passed: audio extraction and 10 timestamped frames; no network.');
} finally {await fs.rm(dir,{recursive:true,force:true});}
