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

            int idx = y * width + x;
            Matrix4x4 m = frameInfo.m_matrix[idx];

            // P_(i-1) * V_(i-1)* M_(i-1) * M_i^(-1) * world
            m = Inverse(m);
            m = m_preFrameInfo.m_matrix[idx] * m;
            m = preWorldToCamera * m;
            m = preWorldToScreen * m;

            Float3 screen = m(frameInfo.m_position(x, y), Float3::Point);

            // Check if out-of-bounds or different object ID
            bool invalid = screen.x < 0 || screen.x > (width - 1) || screen.y < 0 || screen.y > (height - 1);
            invalid = invalid || (frameInfo.m_id(x, y) != m_preFrameInfo.m_id(screen.x, screen.y));

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

            // Mean
            Float3 miu;
            float miu_weight = 0.f;

            for (int l = lmin; l < lmax; l++) {
                for (int k = kmin; k < kmax; k++) {
                    miu += m_accColor(k, l);
                    miu_weight += 1;
                }
            }
            miu /= miu_weight;

            // Std Dev
            Float3 sigma;
            float sigma_weight = 0.f;

            for (int l = lmin; l < lmax; l++) {
                for (int k = kmin; k < kmax; k++) {
                    sigma += Sqr(m_accColor(k, l) - miu);
                    sigma_weight += 1;
                }
            }
            sigma /= sigma_weight;
            sigma = SafeSqrt(sigma);

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
                    dpix /= m_sigmaCoord * m_sigmaCoord;

                    // Color difference
                    float dbeauty = SqrDistance(frameInfo.m_beauty(x, y), frameInfo.m_beauty(k, l));
                    dbeauty /= m_sigmaColor * m_sigmaColor;

                    // Normal difference
                    float dnormal = SafeAcos(Dot(frameInfo.m_normal(x, y), frameInfo.m_normal(k, l)));
                    dnormal *= dnormal;
                    dnormal /= m_sigmaNormal * m_sigmaNormal;

                    // Plane difference
                    Float3 upos = Normalize(frameInfo.m_position(k, l) - frameInfo.m_position(x, y));
                    float dplane = Dot(frameInfo.m_normal(x, y), upos);
                    dplane *= dplane;
                    dplane /= m_sigmaPlane * m_sigmaPlane;

                    float J = dpix + dbeauty + dnormal + dplane;
                    J *= -0.5;
                    J = exp(J);

                    sum_values += frameInfo.m_beauty(k, l) * J;
                    sum_weights += J;
                }
            }

            filteredImage(x, y) = sum_values / sum_weights;
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
