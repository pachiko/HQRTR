#ifdef GL_ES
precision mediump float;
#endif

uniform float uLigIntensity;

void main() { 
    gl_FragColor = vec4(vec3(uLigIntensity), 1.0);
}