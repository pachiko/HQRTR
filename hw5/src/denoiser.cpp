#include "denoiser.h"

Denoiser::Denoiser() : m_useTemportal(false) {}

void Denoiser::Reprojection(const FrameInfo &frameInfo) {
    int height = m_accColor.m_height;
    int width = m_accColor.m_width;

    Matrix4x4 preWorldToScreen = m_preFrameInfo.m_matrix[m_preFrameInfo.m_matrix.size() - 1];
    Matrix4x4 preWorldToCamera = m_preFrameInfo.m_matrix[m_preFrameInfo.m_matrix.size() - 2];

    #pragma omp parallel for
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            // TODO: Reproject

            int object = frameInfo.m_id(x, y);
            if (object < 0) {
                m_valid(x, y) = false;
                m_misc(x, y) = Float3(0.f);
                continue;
            }

            Matrix4x4 m = frameInfo.m_matrix[object];

            // P_(i-1) * V_(i-1)* M_(i-1) * M_i^(-1) * world
            m = Inverse(m);
            m = m_preFrameInfo.m_matrix[object] * m;
            m = preWorldToScreen * m;

            Float3 screen = m(frameInfo.m_position(x, y), Float3::Point);

            // Check if out-of-bounds or different object ID
            bool invalid = screen.x < 0 || screen.x > (width - 1) || screen.y < 0 || screen.y > (height - 1);
            invalid = invalid || (object != m_preFrameInfo.m_id(screen.x, screen.y));

            m_valid(x, y) = !invalid;
            m_misc(x, y) = invalid ? Float3(0.f) : m_accColor(screen.x, screen.y);
        }
    }

    std::swap(m_misc, m_accColor);
}

void Denoiser::TemporalAccumulation(const Buffer2D<Float3> &curFilteredColor) {
    int height = m_accColor.m_height;
    int width = m_accColor.m_width;
    int kernelRadius = 3;

    #pragma omp parallel for
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            // TODO: Temporal clamp

            int kmin = std::max(0, x - kernelRadius);
            int kmax = std::min(width, x + kernelRadius + 1);

            int lmin = std::max(0, y - kernelRadius);
            int lmax = std::min(height, y + kernelRadius + 1);

            
            // Statistics
            Float3 X;
            Float3 X_sqr;
            float weight = 0.f;

            for (int l = lmin; l < lmax; l++) {
                for (int k = kmin; k < kmax; k++) {
                    if (!m_valid(k, l)) continue;
                    X += curFilteredColor(k, l);
                    X_sqr += curFilteredColor(k, l) * curFilteredColor(k, l);
                    weight += 1;
                }
            }
            if (weight == 0.f) {
                m_misc(x, y) = curFilteredColor(x, y);
                continue;
            }
            
            Float3 miu = X / weight;
            Float3 sigma = SafeSqrt(X_sqr / weight - miu * miu); 

            // Clamp
            Float3 prevColor = Clamp(m_accColor(x, y), miu - sigma * m_colorBoxK, miu + sigma * m_colorBoxK);

            // TODO: Exponential moving average
            m_misc(x, y) = Lerp(prevColor, curFilteredColor(x, y), m_alpha);
        }
    }

    std::swap(m_misc, m_accColor);
}

Buffer2D<Float3> Denoiser::Filter(const FrameInfo &frameInfo) {
    int height = frameInfo.m_beauty.m_height;
    int width = frameInfo.m_beauty.m_width;
    Buffer2D<Float3> filteredImage = CreateBuffer2D<Float3>(width, height);
    int kernelRadius = 16;

    #pragma omp parallel for
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            // TODO: Joint bilateral filter

            int kmin = std::max(0, x - kernelRadius);
            int kmax = std::min(width, x + kernelRadius + 1);

            int lmin = std::max(0, y - kernelRadius);
            int lmax = std::min(height, y + kernelRadius + 1);

            Float3 sum_values;
            float sum_weights = 0.f;

            for (int l = lmin; l < lmax; l++) {
                for (int k = kmin; k < kmax; k++) {
                    // Coordinate difference
                    float dpix = SqrDistance(Float3(x, y, 0), Float3(k, l, 0));
                    dpix /= m_sigmaCoord;

                    // Color difference
                    float dbeauty = SqrDistance(frameInfo.m_beauty(x, y), frameInfo.m_beauty(k, l));
                    dbeauty /= m_sigmaColor;

                    // Normal difference (don't want differently oriented pixels to affect each other
                    float dnormal = SafeAcos(Dot(frameInfo.m_normal(x, y), frameInfo.m_normal(k, l))); // acos 0 to 1, so 90 to 0 deg
                    dnormal *= dnormal;
                    dnormal /= m_sigmaNormal;

                    // Plane difference (better than simple depth comparison)
                    Float3 upos = frameInfo.m_position(k, l) - frameInfo.m_position(x, y);
                    float lpos = Length(upos);
                    if (lpos > 0) upos /= lpos;
                    float dplane = Dot(frameInfo.m_normal(x, y), upos);
                    dplane *= dplane;
                    dplane /= m_sigmaPlane;

                    float J = dpix + dbeauty + dnormal + dplane;
                    J *= -0.5;
                    J = exp(J);

                    sum_values += frameInfo.m_beauty(k, l) * J;
                    sum_weights += J;
                }
            }

            if (sum_weights > 0) {
                sum_values /= sum_weights;
                filteredImage(x, y) = sum_values;
            } else {
                filteredImage(x, y) = frameInfo.m_beauty(x, y);
            }
        }
    }

    return filteredImage;
}

void Denoiser::Init(const FrameInfo &frameInfo, const Buffer2D<Float3> &filteredColor) {
    m_accColor.Copy(filteredColor);
    int height = m_accColor.m_height;
    int width = m_accColor.m_width;
    m_misc = CreateBuffer2D<Float3>(width, height);
    m_valid = CreateBuffer2D<bool>(width, height);
}

void Denoiser::Maintain(const FrameInfo &frameInfo) {
    m_preFrameInfo = frameInfo;
}

Buffer2D<Float3> Denoiser::ProcessFrame(const FrameInfo &frameInfo) {
    // Joint Bilateral Filter the current frame
    Buffer2D<Float3> filteredColor;
    filteredColor = Filter(frameInfo);

    // Reproject previous frame color to current
    if (m_useTemportal) {
        Reprojection(frameInfo);
        TemporalAccumulation(filteredColor);
    } else {
        Init(frameInfo, filteredColor); // Setup if first frame
    }

    // Maintain (ie remember previous frameInfo)
    Maintain(frameInfo);
    if (!m_useTemportal) { // Start temporal accumulation after 1st frame
        m_useTemportal = true;
    }
    return m_accColor;
}
