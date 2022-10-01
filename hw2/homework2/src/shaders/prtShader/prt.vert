attribute vec3 aVertexPosition;
attribute mat3 aPrecomputeLT;

uniform mat4 uModelMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;

uniform mat3 uPrecomputeL_R;
uniform mat3 uPrecomputeL_G;
uniform mat3 uPrecomputeL_B;

varying highp vec3 vColor;

float dot_SH(mat3 PrecomputeL, mat3 PrecomputeLT) {
  vec3 L0 = PrecomputeL[0];
  vec3 L1 = PrecomputeL[1];
  vec3 L2 = PrecomputeL[2];
  vec3 LT0 = PrecomputeLT[0];
  vec3 LT1 = PrecomputeLT[1];
  vec3 LT2 = PrecomputeLT[2];
  return dot(L0, LT0) + dot(L1, LT1) + dot(L2, LT2);
}

void main(void) {

  vColor = vec3(dot_SH(uPrecomputeL_R, aPrecomputeLT), dot_SH(uPrecomputeL_G, aPrecomputeLT), dot_SH(uPrecomputeL_B, aPrecomputeLT));

  gl_Position = uProjectionMatrix * uViewMatrix * uModelMatrix *
                vec4(aVertexPosition, 1.0);
}