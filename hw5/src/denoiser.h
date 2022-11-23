#pragma once

#define NOMINMAX
#include <string>

#include "filesystem/path.h"

#include "util/image.h"
#include "util/mathutil.h"

struct FrameInfo {
  public:
    Buffer2D<Float3> m_beauty; // noisy, rendered image
    Buffer2D<float> m_depth; // depth image
    Buffer2D<Float3> m_normal; // normals
    Buffer2D<Float3> m_position; // world pos
    Buffer2D<float> m_id; // object ID, -1 for background
    std::vector<Matrix4x4> m_matrix; // object-to-world (model) matrix for each object,
    // followed by world-to-camera (view) matrix and world-to-screen matrix
};

class Denoiser {
  public:
    Denoiser();

    void Init(const FrameInfo &frameInfo, const Buffer2D<Float3> &filteredColor);
    void Maintain(const FrameInfo &frameInfo);

    void Reprojection(const FrameInfo &frameInfo);
    void TemporalAccumulation(const Buffer2D<Float3> &curFilteredColor);
    Buffer2D<Float3> Filter(const FrameInfo &frameInfo);

    Buffer2D<Float3> ProcessFrame(const FrameInfo &frameInfo);

  public:
    FrameInfo m_preFrameInfo; // previous frame's G-Buffer Info
    Buffer2D<Float3> m_accColor; // accumulated color
    Buffer2D<Float3> m_misc; // temporary array to swap with m_accColor
    Buffer2D<bool> m_valid; // is the back-projected pixel on the previous frame valid?
    bool m_useTemportal;

    float m_alpha = 0.2f; // accumulation weight
    float m_colorBoxK = 1.0f;

    // Sigmas for JBF (needs tuning for different scenes)
    float m_sigmaPlane = 0.1f;
    float m_sigmaColor = 0.6f;
    float m_sigmaNormal = 0.1f;
    float m_sigmaCoord = 32.0f;
};