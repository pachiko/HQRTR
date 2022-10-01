class PRTMaterial extends Material {
    constructor(vertexShader, fragmentShader) {
        super({
            // PRT, see WebGLRenderer.js
            'uPrecomputeL_R': {type: '' , value: null},
            'uPrecomputeL_G': {type: '' , value: null},
            'uPrecomputeL_B': {type: '' , value: null}
        }, [
            'aPrecomputeLT' // See MeshRender.js
        ], vertexShader, fragmentShader, null);
    }
}

async function buildPRTMaterial(vertexPath, fragmentPath) {

    let vertexShader = await getShaderString(vertexPath);
    let fragmentShader = await getShaderString(fragmentPath);

    return new PRTMaterial(vertexShader, fragmentShader);
}