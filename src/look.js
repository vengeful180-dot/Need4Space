// Engine-look shader patches, applied to three's chunks before any material compiles:
//  - PCSS sun shadows: a blocker search, then a filter as wide as the sun's penumbra at that distance - sharp where
//    a part touches, soft under the wings (HDRP's "High" filtering). Fixed spiral, no per-pixel noise: no grain.
//  - Height fog with sun in-scatter: thicker low down, thinner over the peaks, warm toward the sun (aerial perspective).
import * as THREE from 'three';

const v3 = (v) => { const [a, b, c] = v.isColor ? [v.r, v.g, v.b] : [v.x, v.y, v.z]; return `vec3(${a.toFixed(5)}, ${b.toFixed(5)}, ${c.toFixed(5)})`; };

// The meteorite tunnel's dark: every lit material tests its pixel against the cave's centre line (a polyline, baked
// into the shader as constants - the cave never moves). Inside, the sun and all sky light (ambient, hemisphere,
// environment) go to nothing, fading in over the mouths; lamps and the ships' own lights are untouched. Must run
// before the first lit material compiles.
// shade: { lines, R, mouth, amb } - covered stretches (the forest's tunnels of vines): only the sky's light is cut
// there, to amb (the sun comes through the gaps in the leaves - their shadows are real ones)
function polyK(name, lines, R, mouth) {
  const f = (v) => `vec3(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
  let fn = `float ${name}( vec3 w ) {\n\tfloat k = 1.0;\n`;
  lines.forEach(({ pts, len, off = 0, total = len }, c) => {
    const ctr = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(pts.length);
    const bound = Math.max(...pts.map((p) => p.distanceTo(ctr))) + R + 10;
    fn += `\tif ( distance( w, ${f(ctr)} ) < ${bound.toFixed(1)} ) {
\t\tvec3 P${c}[${pts.length}] = vec3[${pts.length}]( ${pts.map(f).join(', ')} );
\t\tfloat dmin = 1e9, t = 0.0;
\t\tfor ( int i = 0; i < ${pts.length - 1}; i ++ ) {
\t\t\tvec3 a = P${c}[ i ], ab = P${c}[ i + 1 ] - a;
\t\t\tfloat h = clamp( dot( w - a, ab ) / dot( ab, ab ), 0.0, 1.0 ), d = length( w - a - ab * h );
\t\t\tif ( d < dmin ) { dmin = d; t = ( float( i ) + h ) / ${(pts.length - 1).toFixed(1)}; }
\t\t}
\t\tfloat inside = 1.0 - smoothstep( ${(R - 4).toFixed(1)}, ${(R + 2).toFixed(1)}, dmin );
\t\tfloat along = ${off.toFixed(1)} + t * ${len.toFixed(1)}, ends = smoothstep( 0.0, ${mouth.toFixed(1)}, min( along, ${total.toFixed(1)} - along ) );
\t\tk = min( k, 1.0 - inside * ends );
\t}
`;
  });
  return fn + '\treturn k;\n}\n';
}

// extra: a map's own dark besides the lines (the forest's hill: GLSL defining caveExtra( w ), per vertex, and
// cavePixel( w, k ), per pixel - light let in where the per-vertex dark is too coarse: a beam down a shaft)
// fill: [r, g, b] - light of its own inside the cave (the Pyramid Run's bore: its glowing rings), added where the sky's
// is shut out; none elsewhere (the chunks unchanged)
export function setCave(lines, R, mouth, shade = null, extra = null, fill = null) {
  const C = THREE.ShaderChunk;
  if (C.common.includes('vCaveW') || (!lines.length && !extra)) return;
  const fn = polyK('caveLight', lines, R, mouth) + (shade?.lines.length ? polyK('shadeK0', shade.lines, shade.R, shade.mouth)
    + `float shadeLight( vec3 w ) { return mix( ${shade.amb.toFixed(3)}, 1.0, shadeK0( w ) ); }\n` : 'float shadeLight( vec3 w ) { return 1.0; }\n')
    + (extra ? extra.glsl : 'float caveExtra( vec3 w ) { return 1.0; }\nfloat cavePixel( vec3 w, float k ) { return 0.0; }\n');
  // (worked out per vertex - it changes over metres, and per pixel it was a loop over the line for every lit pixel
  // near the cave or a tunnel; vCaveW stays for whoever reads it)
  C.common += '\nvarying vec3 vCaveW;\nvarying vec2 vCaveK;\n' + fn;
  C.project_vertex += '\n\tvCaveW = ( vec4( mvPosition.xyz - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;\n\tvCaveK = vec2( min( caveLight( vCaveW ), caveExtra( vCaveW ) ), shadeLight( vCaveW ) );\n';
  const L = C.lights_fragment_begin;
  const a = 'getDirectionalLightInfo( directionalLight, directLight );';
  if (!L.includes(a)) throw new Error('lights chunk changed: cave patch not applied');
  C.lights_fragment_begin = (extra ? 'float caveK = max( vCaveK.x, cavePixel( vCaveW, vCaveK.x ) );\n' : 'float caveK = vCaveK.x;\n')
    + L.replace(a, a + '\n\t\tdirectLight.color *= caveK;');
  C.lights_fragment_end = `{
	float caveAmb = mix( 0.012, 1.0, caveK ) * vCaveK.y;
	irradiance *= caveAmb;
	iblIrradiance *= caveAmb;${fill ? `
	irradiance += vec3( ${fill.map((x) => x.toFixed(3)).join(', ')} ) * ( 1.0 - caveK ) * vCaveK.y;` : ''}
	#if defined( RE_IndirectSpecular )
		radiance *= caveAmb;
		clearcoatRadiance *= caveAmb;
	#endif
}
` + C.lights_fragment_end;
}

// Lit by the sun and the sky alone: no point, spot, hemisphere or area lights in the shader. For the scenery that
// fills the screen (the jungle, the islands, the plants): the track's lamps and the ships' lights reach tens of metres
// and were worked out for every one of its pixels (~10 lights). three writes the lights' counts into the shader as
// text once it has inlined its chunks, so the light chunks are inlined here with those counts at 0. Apply to a
// fragment shader in onBeforeCompile, after its own replacements.
const NO_LAMPS = ['NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS', 'NUM_SPOT_LIGHT_SHADOWS', 'NUM_SPOT_LIGHT_COORDS', 'NUM_SPOT_LIGHT_MAPS',
  'NUM_POINT_LIGHT_SHADOWS', 'NUM_POINT_LIGHTS', 'NUM_SPOT_LIGHTS', 'NUM_HEMI_LIGHTS', 'NUM_RECT_AREA_LIGHTS'];
export function sunOnly(fs) {
  const C = THREE.ShaderChunk, zero = (t) => NO_LAMPS.reduce((x, k) => x.replaceAll(k, '0'), t);
  for (const k of ['lights_pars_begin', 'lights_fragment_begin', 'lights_physical_pars_fragment', 'shadowmap_pars_fragment'])
    fs = fs.replace(`#include <${k}>`, C[k]);
  return zero(fs);
}

// fogChunk: a map's own fog in place of the height fog (fogPars: what it needs, ahead of every lit fragment shader)
// worldOnly: with a single directional shadow it is the world's map drawn once (the forest with shadows off): a soft
// 8-tap lookup, not the PCSS search
export function patchShaders({ sunDir, sunFog, shadowHalf, shadowDepth, cascades = null, sunAngleDeg = 1.6, fogFalloff = 1 / 420,
  fogChunk = null, fogPars = '', worldOnly = false }) {
  const C = THREE.ShaderChunk;
  // Every light has a size: the sun's disc (and a lamp's bulb) widens the specular lobe a little (alpha + 0.014, the
  // sun's ~0.8 deg radius). On glass and clear coat at roughness 0.03 the sun's highlight was a 2-pixel spike thousands
  // of times too bright, which the bloom turned into a square ("the light in reflective stuff looks squary").
  // Direct light only: the sky's reflections keep their sharpness.
  if (!C.lights_physical_pars_fragment.includes('LIGHT_SIZE_ALPHA')) {
    C.lights_physical_pars_fragment = '#define LIGHT_SIZE_ALPHA 0.014\n' + C.lights_physical_pars_fragment.replace(
      /float alpha = pow2\( roughness \);(\s*)vec3 halfDir/g, 'float alpha = pow2( roughness ) + LIGHT_SIZE_ALPHA;$1vec3 halfDir');
  }
  const pen = (half, depth) => ((depth * Math.tan(THREE.MathUtils.degToRad(sunAngleDeg))) / (2 * half)).toFixed(6);
  // ---- PCSS (one map), and the sun's three cascades: a tight map round the ship (hull detail), one round the pack, a
  // wide one ahead
  const pcss = /* glsl */`
	vec2 pcssSpiral( int i, float n ) {
		float r = sqrt( ( float( i ) + 0.5 ) / n ), a = float( i ) * 2.39996323;
		return r * vec2( cos( a ), sin( a ) );
	}
	float pcssLerp( sampler2D map, vec2 size, vec2 uv, float z ) {
		vec2 t = 1.0 / size, c = uv * size - 0.5, f = fract( c ), b = ( floor( c ) + 0.5 ) * t;
		float a = step( z, unpackRGBAToDepth( textureLod( map, b, 0.0 ) ) );
		float bx = step( z, unpackRGBAToDepth( textureLod( map, b + vec2( t.x, 0.0 ), 0.0 ) ) );
		float by = step( z, unpackRGBAToDepth( textureLod( map, b + vec2( 0.0, t.y ), 0.0 ) ) );
		float bxy = step( z, unpackRGBAToDepth( textureLod( map, b + t, 0.0 ) ) );
		return mix( mix( a, bx, f.x ), mix( by, bxy, f.x ), f.y );
	}
	float pcssCore( sampler2D map, vec2 size, vec3 sc, float penK ) {
		// blockers: within the widest penumbra this map can show (24 texels)
		float search = 24.0 / size.x, zsum = 0.0, nb = 0.0;
		for ( int i = 0; i < 16; i ++ ) {
			float d = unpackRGBAToDepth( textureLod( map, sc.xy + pcssSpiral( i, 16.0 ) * search, 0.0 ) );
			if ( d < sc.z ) { zsum += d; nb += 1.0; }
		}
		if ( nb < 0.5 ) return 1.0;
		// penumbra (shadow-map uv) = blocker-to-receiver depth x tan(sun angle), at least 2.5 texels of filtering (less
		// let the caster's outline, drawn in texels, show through as a wavy staircase)
		float pen = clamp( ( sc.z - zsum / nb ) * penK, 2.5 / size.x, search );
		// each tap a bilinear blend of its four texels' tests: binary taps snapped every edge to the texel grid and a
		// hull's shadow edges came out as staircases ("a way to fix this aa?"); a wide penumbra gets more taps
		int n = pen * size.x < 4.0 ? 12 : 24;
		float lit = 0.0;
		for ( int i = 0; i < 24; i ++ ) {
			if ( i >= n ) break;
			lit += pcssLerp( map, size, sc.xy + pcssSpiral( i, float( n ) ) * pen, sc.z );
		}
		return lit / float( n );
	}
	float pcssShadow( sampler2D map, vec2 size, vec3 sc ) {
		// fade out toward the box's border: a caster half inside the box (a gantry ahead) was cut into a dark
		// triangle that grew and shrank as the box followed the ship
		float border = min( min( sc.x, 1.0 - sc.x ), min( sc.y, 1.0 - sc.y ) );
		return mix( 1.0, pcssCore( map, size, sc, ${pen(shadowHalf, shadowDepth)} ), smoothstep( 0.0, 0.14, border ) );
	}
	float getShadow(`;
  let s = C.shadowmap_pars_fragment;
  if (!s.includes('float getShadow(') || s.split('if ( frustumTest ) {').length !== 2) throw new Error('shadow chunk changed: PCSS patch not applied');
  s = s.replace('\tfloat getShadow(', pcss);
  s = s.replace('if ( frustumTest ) {',
    'if ( frustumTest ) {\n\t\t\treturn mix( 1.0, pcssShadow( shadowMap, shadowMapSize, shadowCoord.xyz ), shadowIntensity );');
  if (cascades) {
    s += /* glsl */`
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS >= 3
	float cascadeLevel( sampler2D map, vec2 size, vec4 coord, float bias, float penK, out float inside ) {
		vec3 sc = coord.xyz / coord.w;
		sc.z += bias;
		float border = min( min( sc.x, 1.0 - sc.x ), min( sc.y, 1.0 - sc.y ) );
		inside = ( sc.z <= 1.0 ) ? smoothstep( 0.0, 0.1, border ) : 0.0;
		if ( inside <= 0.0 ) return 1.0;
		return pcssCore( map, size, sc, penK );
	}
	// the finest map that covers the point, blending to the next one out across its outer 10 %: the ship's, then the
	// mid box round the pack, then the wide one ahead (each looked up only where it is needed)
	float cascadeShadow() {
		float in0, in1, in2;
		float s0 = cascadeLevel( directionalShadowMap[ 0 ], directionalLightShadows[ 0 ].shadowMapSize, vDirectionalShadowCoord[ 0 ],
			directionalLightShadows[ 0 ].shadowBias, ${pen(cascades[0].half, cascades[0].depth)}, in0 );
		if ( in0 >= 0.999 ) return s0;
		float s1 = cascadeLevel( directionalShadowMap[ 1 ], directionalLightShadows[ 1 ].shadowMapSize, vDirectionalShadowCoord[ 1 ],
			directionalLightShadows[ 1 ].shadowBias, ${pen(cascades[1].half, cascades[1].depth)}, in1 );
		if ( in1 >= 0.999 ) return mix( s1, s0, in0 );
		float s2 = cascadeLevel( directionalShadowMap[ 2 ], directionalLightShadows[ 2 ].shadowMapSize, vDirectionalShadowCoord[ 2 ],
			directionalLightShadows[ 2 ].shadowBias, ${pen(cascades[2].half, cascades[2].depth)}, in2 );
		return mix( mix( mix( 1.0, s2, in2 ), s1, in1 ), s0, in0 );
	}
#endif`;
    s += /* glsl */`
#if defined( USE_SHADOWMAP )
	// a map of the whole world drawn once (the forest's islands and trees, at any distance): 4 soft taps, each a
	// bilinear blend of its texels (leaves: one - they are a mass, and drawn in layers)
	float worldFilter( sampler2D map, vec2 size, vec4 coord, float bias ) {
		vec3 sc = coord.xyz / coord.w;
		sc.z += bias;
		if ( sc.x <= 0.0 || sc.x >= 1.0 || sc.y <= 0.0 || sc.y >= 1.0 || sc.z >= 1.0 ) return 1.0;
	#ifdef FOLIAGE_ONE_TAP
		return pcssLerp( map, size, sc.xy, sc.z );
	#else
		float lit = 0.0;
		for ( int i = 0; i < 4; i ++ ) lit += pcssLerp( map, size, sc.xy + pcssSpiral( i, 4.0 ) * 1.4 / size.x, sc.z );
		return lit / 4.0;
	#endif
	}
#endif
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS >= 4
	// the world's own shadow: a fourth light's map
	float worldShadow() {
		return worldFilter( directionalShadowMap[ 3 ], directionalLightShadows[ 3 ].shadowMapSize, vDirectionalShadowCoord[ 3 ], directionalLightShadows[ 3 ].shadowBias );
	}
#else
	float worldShadow() { return 1.0; }
#endif`;
    const L = C.lights_fragment_begin;
    const old = `\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
\t\tdirectionalLightShadow = directionalLightShadows[ i ];
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t\t#endif`;
    if (!L.includes(old)) throw new Error('lights chunk changed: cascade patch not applied');
    // light 0 is the sun (all three cascades), lights 1 and 2 only carry the mid and far maps (intensity 0: no light)
    C.lights_fragment_begin = L.replace(old, `\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
\t\t#if NUM_DIR_LIGHT_SHADOWS >= 3
\t\t#if UNROLLED_LOOP_INDEX == 0
\t\t#ifdef FOLIAGE_SHADOW
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? worldShadow() : 1.0;
\t\t#else
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? cascadeShadow() * worldShadow() : 1.0;
\t\t#endif
\t\t#endif
\t\t#elif NUM_DIR_LIGHT_SHADOWS == 1 && ${worldOnly ? 1 : 0}
\t\tdirectionalLightShadow = directionalLightShadows[ i ];
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? worldFilter( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, vDirectionalShadowCoord[ i ], directionalLightShadow.shadowBias ) : 1.0;
\t\t#else
\t\tdirectionalLightShadow = directionalLightShadows[ i ];
\t\tdirectLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
\t\t#endif
\t\t#endif`);
  }
  // The mid/far cascade lights only carry shadow maps. The atmospheric maps'
  // fourth light carries the world map too; Space's fourth light is planet-shine.
  if (cascades) {
    const L = C.lights_fragment_begin, from = L.indexOf('DirectionalLight directionalLight;');
    const to = L.indexOf('#pragma unroll_loop_end', from), direct = /RE_Direct\( directLight[^;]*;/g;
    const loop = L.slice(from, to);
    if (from < 0 || to < 0 || [...loop.matchAll(direct)].length !== 1) throw new Error('lights chunk changed: shadow-only patch not applied');
    C.lights_fragment_begin = L.slice(0, from) + loop.replace(direct, (m) =>
      `#if UNROLLED_LOOP_INDEX != 1 && UNROLLED_LOOP_INDEX != 2${worldOnly ? ' && UNROLLED_LOOP_INDEX != 3' : ''}\n\t\t${m}\n\t\t#endif`) + L.slice(to);
  }
  C.shadowmap_pars_fragment = s;
  // the sun's light (directional light 0) scaled by staticSun: what a material knows of shadows baked over it (the
  // track's fittings': trackshadow.js) - set in its main() before the lights, 1 elsewhere. Outside the shadow maps'
  // switch: the bake shows with the live shadows off too
  if (!C.lights_pars_begin.includes('staticSun')) {
    const at = 'getDirectionalLightInfo( directionalLight, directLight );';
    if (C.lights_fragment_begin.split(at).length !== 2) throw new Error('lights chunk changed: baked sun shadows not applied');
    C.lights_pars_begin = 'float staticSun = 1.0;\n' + C.lights_pars_begin;
    C.lights_fragment_begin = C.lights_fragment_begin.replace(at, at + '\n\t\t#if UNROLLED_LOOP_INDEX == 0\n\t\tdirectLight.color *= staticSun;\n\t\t#endif');
  }

  // ---- height fog with sun in-scatter (fogDensity = extinction per metre at y = 0)
  C.fog_pars_vertex = '#ifdef USE_FOG\n\tvarying float vFogDepth;\n\tvarying vec3 vFogWorld;\n#endif';
  C.fog_vertex = /* glsl */`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = ( vec4( mvPosition.xyz - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
#endif`;
  C.fog_pars_fragment = /* glsl */`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`;
  C.fog_fragment = /* glsl */`#ifdef USE_FOG
	#ifdef FOG_EXP2
		vec3 fogRay = vFogWorld - cameraPosition;
		float fogDist = length( fogRay );
		vec3 fogDir = fogRay / max( fogDist, 1e-3 );
		float fogK = ${fogFalloff.toFixed(6)}, fogY = fogDir.y * fogDist * fogK;
		float fogOD = fogDensity * exp( - fogK * max( cameraPosition.y, 0.0 ) ) * fogDist *
			( abs( fogY ) > 1e-4 ? ( 1.0 - exp( - fogY ) ) / fogY : 1.0 );
		float fogFactor = 1.0 - exp( - fogOD );
		float fogSun = pow( max( dot( fogDir, ${v3(sunDir)} ), 0.0 ), 6.0 );
		vec3 fogCol = mix( fogColor, ${v3(sunFog)}, fogSun * 0.65 );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		vec3 fogCol = fogColor;
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;
  if (fogChunk) {
    C.fog_fragment = fogChunk;
    C.fog_pars_fragment += `\n#ifdef USE_FOG\n${fogPars}\n#endif`;
  }
}
