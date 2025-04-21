shader_type spatial;
render_mode unshaded; // Use unshaded to avoid lighting calculations

uniform sampler2D star_sky;
uniform sampler2D moon;
uniform vec4 moon_tint : source_color;
uniform vec4 clouds_tint : source_color;
uniform bool SCATERRING;
uniform vec3 SUN_POS; // Normalize in script
uniform vec3 MOON_POS; // Normalize in script
uniform vec3 MOON_TEX_POS; // Normalize in script
uniform vec3 LIGHTING_POS; // Normalize in script
uniform float lighting_strength;

uniform float MOON_PHASE : hint_range(-1.1, 1.1);
uniform float moon_size : hint_range(0.0, 0.5);
uniform float attenuation : hint_range(0.0, 1.0);

// Cloud parameters
uniform vec3 WIND; // Wind vector * strength
uniform float SIZE : hint_range(0.0, 10.0) = 0.5;
uniform float SOFTNESS : hint_range(0.0, 10.0) = 0.5;
uniform float COVERAGE : hint_range(0.0, 1.0) = 0.5;
uniform float HEIGHT : hint_range(0.0, 1.0) = 0.0;
uniform float THICKNESS : hint_range(0.0, 100.0) = 25.0;
uniform float ABSORPTION : hint_range(0.0, 10.0) = 1.030725;
uniform int STEPS : hint_range(0, 100) = 25;

// Noise functions
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1) * 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 pos) {
    vec3 i = floor(pos);
    vec3 f = fract(pos);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

float get_noise(vec3 p, float FBM_FREQ) {
    float t = 0.51749673 * noise(p);
    p *= FBM_FREQ;
    t += 0.25584929 * noise(p);
    p *= FBM_FREQ;
    t += 0.12527603 * noise(p);
    p *= FBM_FREQ;
    t += 0.06255931 * noise(p);
    return t;
}

// Sphere intersection for clouds
bool SphereIntersect(vec3 apos, float arad, vec3 ro, vec3 rd, out vec3 norm) {
    ro -= apos;
    float B = 2.0 * dot(ro, rd);
    float C = dot(ro, ro) - arad * arad;
    float D = B * B - 4.0 * C;
    if (D < 0.0) return false;
    D = sqrt(D);
    float t1 = (-B + D) * 0.5;
    float t2 = (-B - D) * 0.5;
    float t = t1 < 0.0 ? t2 : t1;
    t = t2 < 0.0 ? t1 : t2;
    t = min(t1, t2);
    if (t < 0.0) return false;
    norm = ro + t * rd;
    return true;
}

// Cloud density
float density(vec3 pos, vec3 offset) {
    vec3 p = pos * 0.02 / SIZE + offset;
    float dens = get_noise(p, 2.0 + SOFTNESS);
    dens *= smoothstep(COVERAGE, COVERAGE + 0.07, dens);
    return clamp(dens, 0.0, 1.0);
}

// 3D clouds
vec4 clouds_3d(vec3 ro, vec3 rd, vec3 wind) {
    vec3 apos = vec3(0, -450, 0);
    float arad = 500.0;
    vec3 clouds = vec3(0.0);
    float alpha = 0.0;
    vec3 norm;
    if (SphereIntersect(apos, arad, ro, rd, norm)) {
        int steps = STEPS;
        float march_step = THICKNESS / float(steps);
        vec3 dir_step = rd / rd.y * march_step;
        vec3 pos = norm;
        float T = 1.0;
        for (int i = 0; i < steps; i++) {
            if (length(pos) > 1e3) break;
            float dens = density(pos, wind) * march_step;
            float T_i = exp(-ABSORPTION * dens);
            T *= T_i;
            if (T < 0.01) break;
            float h = float(i) / float(steps);
            clouds += T * (exp(h) / 2.0) * dens;
            alpha += (1.0 - T_i) * (1.0 - alpha);
            pos += dir_step;
        }
    }
    return vec4(clouds, alpha);
}

// Atmosphere effect
vec3 extra_cheap_atmosphere(vec3 raydir, vec3 sundir) {
    sundir.y = max(sundir.y, -0.07);
    float special_trick = 1.0 / (raydir.y + 0.2);
    float special_trick2 = 1.0 / (sundir.y * 11.0 + 1.0);
    vec3 magic_sky_color = vec3(0.245535, 0.580357, 1.0);
    float sun_dist = max(0.0, dot(sundir, raydir));
    float mymie = pow(sun_dist, 8.0) * special_trick * 0.33;
    vec3 suncolor = mix(vec3(1.0), max(vec3(0.0), vec3(1.0) - magic_sky_color), special_trick2);
    vec3 sky = max(vec3(0.0), magic_sky_color * suncolor - magic_sky_color * 0.0896 * (special_trick + -6.0 * sundir.y * sundir.y));
    sky *= special_trick * (0.24 + pow(sun_dist, 2.0) * 0.24);
    sky += mymie * suncolor;
    float sun = pow(sun_dist, 2048.0);
    sky += sun;
    return clamp(sky, 0.0, 1.0);
}

// Spherical UV mapping for moon
vec2 uv_sphere(vec3 rd, vec3 pos, float scale) {
    vec3 ord = normalize(rd + 2.0 * cross(pos, cross(pos, rd)));
    vec2 uv = vec2(atan(ord.x, ord.y), acos(ord.z));
    uv.x += 2.0 * 3.1415926536 * float(uv.x < 0.0);
    uv /= vec2(2.0 * 3.1415926536, 3.1415926536);
    uv = (uv - 0.5) / scale + 0.5;
    uv.x *= 2.0;
    uv.x -= 0.5;
    return uv;
}

// Draw moon
vec2 draw_moon(vec3 rd) {
    vec2 uv = uv_sphere(rd, MOON_TEX_POS, moon_size);
    float moon_amount = texture(moon, uv).r;
    moon_amount *= 1.0 - smoothstep(moon_size * 1.0, moon_size * 1.4, length(MOON_POS - rd));
    float moon_mask = moon_amount;
    moon_amount *= 1.0 - attenuation;
    moon_amount = clamp(mix(0.0, moon_amount, smoothstep(0.9, 1.0, (1.0 - moon_size) * 0.5 + length(MOON_POS - rd + MOON_PHASE) * (1.0 - moon_size * 0.75))), 0.001, 1.0);
    return vec2(moon_amount, moon_mask);
}

// Draw night sky
vec3 draw_night_sky(float sky_amount, vec3 rd, vec2 sky_coords, float cld_alpha) {
    vec2 moon_amount = draw_moon(rd);
    float stars = texture(star_sky, sky_coords).r;
    stars *= step(max(max(cld_alpha, sky_amount), moon_amount.y), 0.01);
    return stars + moon_tint.rgb * moon_amount.x * clamp(1.0 - cld_alpha - 0.2, 0.0, 1.0);
}

void fragment() {
    vec3 rd = normalize(VIEW); // Use VIEW for view direction
    rd.x *= -1.0; // Fix inverted x-axis
    vec3 ro = vec3(0.0, -200.0 * HEIGHT + 40.0, 0.0);

    // Compute spherical UV coordinates for star sky
    vec2 sky_coords = vec2(atan(rd.x, rd.z) / (2.0 * 3.1415926536) + 0.5, acos(rd.y) / 3.1415926536);

    // Simulate quarter-resolution pass logic
    float skyPow = dot(rd, vec3(0.0, -1.0, 0.0));
    float horizonPow = 1.0 - pow(1.0 - abs(skyPow), 5.0);
    float horizon_line = clamp(1.0 - exp(-10.0 * pow(max(0.0, horizonPow), 2.6)), 0.0, 1.0);
    vec4 cld;
    if (rd.y > 0.0) {
        cld = clouds_3d(ro, rd, WIND * TIME / SIZE);
    } else {
        cld.rgb = vec3(get_noise(rd + WIND * TIME, 3.0));
        cld.a = 1.0;
    }
    cld *= horizon_line;

    // Main sky rendering
    vec4 clouds;
    clouds.rgb = cld.r * clouds_tint.rgb * attenuation;
    clouds.a = cld.a;
    vec3 sky = extra_cheap_atmosphere(rd, SUN_POS);
    sky = mix(vec3(0.0), sky, smoothstep(-0.1, 0.0, rd.y));
    sky = max(sky, draw_night_sky(max(max(sky.b, sky.r), sky.g), rd, sky_coords, clouds.a));
    float lighting = clamp(0.5 + texture(moon, LIGHTING_POS.xz - rd.xz + 0.5).g * smoothstep(0.6, 0.3, length(LIGHTING_POS - rd)), 0.0, 1.0);
    sky = mix(sky, vec3(lighting), lighting_strength);
    sky = mix(sky, clouds.rgb / (0.0001 + clouds.a), clouds.a);

    ALBEDO = sky; // Output to ALBEDO for spatial shader
}