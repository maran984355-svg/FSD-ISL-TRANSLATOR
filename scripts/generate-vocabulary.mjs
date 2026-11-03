/**
 * Generator script for pre-calibrated vocabulary.json
 */
import fs from 'fs';
import { ISL_CLIPS } from '../avatar/animations/isl-clips.js';
import { FeatureExtractor } from '../recognition/feature-extractor.js';
import { BASE_POSES } from '../avatar/gestures/base-poses.js';
import { ISL_HANDSHAPES } from '../avatar/gestures/handshapes.js';

const vocab = {};

// Helper to convert avatar pose & handshape to 21-landmark array
function poseToLandmarks(armData, handshapeKey) {
  if (!armData) return null;
  const hs = ISL_HANDSHAPES[handshapeKey] || ISL_HANDSHAPES.OPEN_FLAT;

  const wrist = { x: armData.wristX || 0, y: -(armData.wristY || 0), z: 0 };
  const landmarks = [wrist];

  // Palm MCPs (1, 5, 9, 13, 17)
  const palmWidth = 0.08;
  const palmHeight = 0.09;
  
  // Thumb (1, 2, 3, 4)
  const tFlex = hs.flexion[0];
  const tSpread = hs.spread[0];
  for (let step = 1; step <= 4; step++) {
    landmarks.push({
      x: wrist.x - 0.03 * step * (1 - tFlex * 0.5) - tSpread * 0.01 * step,
      y: wrist.y - 0.02 * step * (1 - tFlex * 0.7),
      z: 0.01 * step
    });
  }

  // Index (5, 6, 7, 8)
  const iFlex = hs.flexion[1];
  for (let step = 1; step <= 4; step++) {
    landmarks.push({
      x: wrist.x - 0.015 * (4 - step) * 0.3,
      y: wrist.y - 0.035 * step * (1 - iFlex * 0.75),
      z: iFlex * 0.02 * step
    });
  }

  // Middle (9, 10, 11, 12)
  const mFlex = hs.flexion[2];
  for (let step = 1; step <= 4; step++) {
    landmarks.push({
      x: wrist.x,
      y: wrist.y - 0.038 * step * (1 - mFlex * 0.75),
      z: mFlex * 0.02 * step
    });
  }

  // Ring (13, 14, 15, 16)
  const rFlex = hs.flexion[3];
  for (let step = 1; step <= 4; step++) {
    landmarks.push({
      x: wrist.x + 0.015 * (step * 0.3),
      y: wrist.y - 0.034 * step * (1 - rFlex * 0.75),
      z: rFlex * 0.02 * step
    });
  }

  // Pinky (17, 18, 19, 20)
  const pFlex = hs.flexion[4];
  for (let step = 1; step <= 4; step++) {
    landmarks.push({
      x: wrist.x + 0.028 * (step * 0.3),
      y: wrist.y - 0.028 * step * (1 - pFlex * 0.75),
      z: pFlex * 0.02 * step
    });
  }

  return landmarks;
}

const ALIAS_SIGNS = new Set(['THANK', 'THANKS', 'HELLO', 'HI', 'GREETINGS', 'ASSIST', 'ASSISTANCE', 'TRAIN', 'STATION', 'HOSPITAL', 'EAT', 'BYE', 'STUDY', 'I', 'GOOD', 'ALL']);

// Generate template feature sequence for each clip
for (const [signId, clip] of ISL_CLIPS.entries()) {
  if (ALIAS_SIGNS.has(signId)) continue;
  const framesCount = 18;
  const sequence = [];

  for (let i = 0; i < framesCount; i++) {
    const progress = i / (framesCount - 1);
    const pose = clip.sample(progress);

    const leftLm = poseToLandmarks(pose.leftArm, pose.leftHand?.name || 'OPEN_FLAT');
    const rightLm = poseToLandmarks(pose.rightArm, pose.rightHand?.name || 'OPEN_FLAT');

    const { vector } = FeatureExtractor.extractFrameFeatures({
      leftHand: leftLm,
      rightHand: rightLm
    });

    sequence.push(vector);
  }

  // Add 2 template variations (standard + slightly stretched/scaled) to support multi-signer
  const template1 = sequence;
  const template2 = sequence.map(vec => vec.map(v => v * 1.02 + 0.005));

  vocab[signId] = {
    id: signId.toLowerCase(),
    name: clip.name,
    displayText: clip.name.split('/')[0].trim(),
    templates: [
      { id: 'base_template_1', signer: 'Signer_A', frames: template1 },
      { id: 'base_template_2', signer: 'Signer_B', frames: template2 }
    ]
  };
}

fs.writeFileSync('./data/vocabulary.json', JSON.stringify(vocab, null, 2));
console.log(`Generated data/vocabulary.json with ${Object.keys(vocab).length} signs.`);
