#include <iostream>
#include <vector>
#include <algorithm>
#include <cmath>
#include <sstream>
#include <fstream>
#include <random>
#include "vec.h"

#define STB_IMAGE_WRITE_IMPLEMENTATION

#ifndef M_PI
#define M_PI  3.14159265358979323846
#endif

#include "stb_image_write.h"

const int resolution = 128;

typedef struct samplePoints {
    std::vector<Vec3f> directions;
	std::vector<float> PDFs;
}samplePoints;

// FIXME use move?
samplePoints squareToCosineHemisphere(int sample_count) {
    samplePoints sampleList;
    const int sample_side = static_cast<int>(floor(sqrt(sample_count)));

    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<> rng(0.0, 1.0);
    for (int t = 0; t < sample_side; t++) {
        for (int p = 0; p < sample_side; p++) {
            double samplex = (t + rng(gen)) / sample_side;
            double sampley = (p + rng(gen)) / sample_side;
            
            double theta = 0.5f * acos(1 - 2*samplex);
            double phi =  2 * M_PI * sampley;
            Vec3f wi = Vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta));
            float pdf = wi.z / PI;
            
            sampleList.directions.push_back(wi);
            sampleList.PDFs.push_back(pdf);
        }
    }
    return sampleList;
}

float DistributionGGX(Vec3f N, Vec3f H, float roughness) {
    float a = roughness*roughness;
    float a2 = a*a;
    float NdotH = std::max(dot(N, H), 0.0f);
    float NdotH2 = NdotH*NdotH;

    float num = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return num / std::max(denom, 0.0001f);
}

float GeometrySchlickGGX(float NdotV, float roughness) {
    float a = roughness + 1;
    float k = a * a / 8.0;
    //float k = (a * a) / 2.0f; // why not (roughness + 1)^2/8

    float num = NdotV;
    float denom = NdotV * (1.0f - k) + k;

    return num / denom;
}

float GeometrySmith(float roughness, float LdotH, float VdotH) {
    float ggx2 = GeometrySchlickGGX(LdotH, roughness);
    float ggx1 = GeometrySchlickGGX(VdotH, roughness);

    return ggx1 * ggx2;
}

//float FresnelSchlick() {
//    return 1.f;
//}

Vec3f IntegrateBRDF(Vec3f V, float roughness, float NdotV) {
    float A = 0.0;
    float B = 0.0;
    float C = 0.0;
    const int sample_count = 1024;
    Vec3f N = Vec3f(0.0, 0.0, 1.0);
    
    samplePoints sampleList = squareToCosineHemisphere(sample_count);
    for (int i = 0; i < sample_count; i++) {
        float pdf = sampleList.PDFs[i];
        Vec3f wi = normalize(sampleList.directions[i]);
        Vec3f h = normalize(wi + V);
        float NdotWi = dot(N, wi);

        float Dggx = DistributionGGX(N, h, roughness);
        float Gsmith = GeometrySmith(roughness, dot(N, V), dot(N, wi));
        
        float f = Gsmith * Dggx / (4 * NdotV * NdotWi);
        A += f * NdotWi / pdf;
    }
    C = B = A;
    
    return {A / sample_count, B / sample_count, C / sample_count};
}

int main() {
    uint8_t data[resolution * resolution * 3];
    float step = 1.0 / resolution;

    for (int i = 0; i < resolution; i++) {
        for (int j = 0; j < resolution; j++) {
            float roughness = step * (static_cast<float>(i) + 0.5f);
            float NdotV = step * (static_cast<float>(j) + 0.5f);
            Vec3f V = Vec3f(std::sqrt(1.f - NdotV * NdotV), 0.f, NdotV); // recover view from n.v

            Vec3f irr = IntegrateBRDF(V, roughness, NdotV);

            data[(i * resolution + j) * 3 + 0] = uint8_t(irr.x * 255.0);
            data[(i * resolution + j) * 3 + 1] = uint8_t(irr.y * 255.0);
            data[(i * resolution + j) * 3 + 2] = uint8_t(irr.z * 255.0);
        }
    }
    stbi_flip_vertically_on_write(true);
    stbi_write_png("GGX_E_MC_LUT.png", resolution, resolution, 3, data, resolution * 3);
    
    std::cout << "Finished precomputed!" << std::endl;
    return 0;
}