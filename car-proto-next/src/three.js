// Three.js r128 from npm, with the post-processing addons the game used to load from the CDN as THREE.EffectComposer and so on.
// One object, so the game keeps writing THREE.X. Its properties can be replaced: the tests hook it through window.__threeHook.
import * as core from 'three';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export const THREE = { ...core, CopyShader, LuminosityHighPassShader, FXAAShader, EffectComposer, RenderPass, ShaderPass, UnrealBloomPass };
if (typeof window !== 'undefined' && typeof window.__threeHook === 'function') window.__threeHook(THREE);      // test seam (dev/tests/test_world.py)
