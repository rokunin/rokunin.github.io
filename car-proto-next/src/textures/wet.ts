// Puddles on a baked ground material: a wetness field from the roughness map's blue channel makes it dark, glossy and flat.

// Puddles: the wetness field is read at a different, rotated scale than the slabs, so the pattern never lines up with the tiling.
export function wetGround(mat, scale) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `
        float roughnessFactor = roughness * texture2D( roughnessMap, vRoughnessMapUv ).g;
        vec2 wuv = mat2( 0.8, -0.6, 0.6, 0.8 ) * ( vRoughnessMapUv * ${scale.toFixed(4)} ) + vec2( 0.37, 0.11 );
        float wetMask = smoothstep( 0.675, 0.725, texture2D( roughnessMap, wuv ).b );
        roughnessFactor = mix( roughnessFactor, 0.07, wetMask );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.13, 0.15, 0.19 ), wetMask );`)
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = metalness * wetMask;')
      .replace('#include <normal_fragment_maps>', `vec3 dryNormal = normal;
        #include <normal_fragment_maps>
        normal = normalize( mix( normal, dryNormal, wetMask * 0.8 ) );`);
  };
  return mat;
}
