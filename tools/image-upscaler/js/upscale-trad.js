/**
 * Traditional Image Upscaling Methods
 * All methods use Canvas ImageData for pixel-perfect manipulation
 */
const TradUpscaler = (() => {
    'use strict';

    // ---- Helper functions ----

    function clamp(x, min, max) {
        return x < min ? min : x > max ? max : x;
    }

    function toInt(x) {
        return x < 0 ? 0 : x > 255 ? 255 : (x + 0.5) | 0;
    }

    // Lanczos window function
    function lanczos(x, a) {
        if (x === 0) return 1;
        if (x >= a) return 0;
        const px = Math.PI * x;
        return (Math.sin(px) / px) * (Math.sin(px / a) / (px / a));
    }

    // Cubic convolution basis functions
    function cubicCatmullRom(t) {
        const t2 = t * t, t3 = t2 * t;
        if (t < 0) t = -t;
        if (t < 1) return 1.5 * t3 - 2.5 * t2 + 1;
        if (t < 2) return -0.5 * t3 + 2.5 * t2 - 4 * t + 2;
        return 0;
    }

    function cubicMitchell(t) {
        const B = 1/3, C = 1/3;
        const at = Math.abs(t);
        const at2 = at * at;
        const at3 = at2 * at;
        const a = 12 - 9*B - 6*C;
        const b = -18 + 12*B + 6*C;
        const c = 6 - 2*B;
        const d = -B - 6*C;
        const e = 6*B + 30*C;
        const f = -12*B - 48*C;
        const g = 8*B + 24*C;
        if (at < 1) return (a*at3 + b*at2 + c) / 6;
        if (at < 2) return (d*at3 + e*at2 + f*at + g) / 6;
        return 0;
    }

    function cubicBSpline(t) {
        const at = Math.abs(t);
        if (at < 1) return 0.5 * at * at * at - at * at + 2/3;
        if (at < 2) {
            const v = 2 - at;
            return (1/6) * v * v * v;
        }
        return 0;
    }

    // ---- Core interpolation engine ----

    function interpolate1D(pixels, srcW, srcH, dstW, dstH, weightFn, radius) {
        const srcChannels = 4;
        const dst = new Uint8ClampedArray(dstW * dstH * 4);
        const scaleX = srcW / dstW;
        const scaleY = srcH / dstH;

        for (let y = 0; y < dstH; y++) {
            const srcY = (y + 0.5) * scaleY - 0.5;
            const y0 = Math.floor(srcY);
            const yFrac = srcY - y0;

            for (let x = 0; x < dstW; x++) {
                const srcX = (x + 0.5) * scaleX - 0.5;
                const x0 = Math.floor(srcX);
                const xFrac = srcX - x0;

                let r = 0, g = 0, b = 0, a = 0, totalWeight = 0;

                const yStart = Math.max(0, y0 - radius + 1);
                const yEnd = Math.min(srcH - 1, y0 + radius);
                const xStart = Math.max(0, x0 - radius + 1);
                const xEnd = Math.min(srcW - 1, x0 + radius);

                for (let iy = yStart; iy <= yEnd; iy++) {
                    const wy = weightFn((iy - srcY) * (iy <= y0 ? 1 : 1));
                    if (wy === 0) continue;
                    for (let ix = xStart; ix <= xEnd; ix++) {
                        const wx = weightFn((ix - srcX) * (ix <= x0 ? 1 : 1));
                        const w = wy * wx;
                        if (w === 0) continue;
                        const idx = (iy * srcW + ix) * 4;
                        r += pixels[idx] * w;
                        g += pixels[idx + 1] * w;
                        b += pixels[idx + 2] * w;
                        a += pixels[idx + 3] * w;
                        totalWeight += w;
                    }
                }

                if (totalWeight > 0) {
                    const invW = 1 / totalWeight;
                    const di = (y * dstW + x) * 4;
                    dst[di] = clamp(r * invW, 0, 255);
                    dst[di + 1] = clamp(g * invW, 0, 255);
                    dst[di + 2] = clamp(b * invW, 0, 255);
                    dst[di + 3] = clamp(a * invW, 0, 255);
                }
            }
        }
        return dst;
    }

    // ---- Method 1: Nearest Neighbor ----
    function nearestNeighbor(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;
        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        const scaleX = srcW / targetW;
        const scaleY = srcH / targetH;

        for (let y = 0; y < targetH; y++) {
            const sy = Math.min(Math.floor(y * scaleY), srcH - 1);
            const srcRowStart = sy * srcW;
            const dstRowStart = y * targetW;
            for (let x = 0; x < targetW; x++) {
                const sx = Math.min(Math.floor(x * scaleX), srcW - 1);
                const si = (srcRowStart + sx) * 4;
                const di = (dstRowStart + x) * 4;
                dst[di] = src[si];
                dst[di + 1] = src[si + 1];
                dst[di + 2] = src[si + 2];
                dst[di + 3] = src[si + 3];
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 2: Bilinear ----
    function bilinear(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;
        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        const scaleX = srcW / targetW;
        const scaleY = srcH / targetH;

        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * scaleY - 0.5;
            const y1 = clamp(Math.floor(srcY), 0, srcH - 1);
            const y2 = clamp(y1 + 1, 0, srcH - 1);
            const yFrac = srcY - y1;

            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * scaleX - 0.5;
                const x1 = clamp(Math.floor(srcX), 0, srcW - 1);
                const x2 = clamp(x1 + 1, 0, srcW - 1);
                const xFrac = srcX - x1;

                const i00 = (y1 * srcW + x1) * 4;
                const i10 = (y1 * srcW + x2) * 4;
                const i01 = (y2 * srcW + x1) * 4;
                const i11 = (y2 * srcW + x2) * 4;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    const v = (1 - yFrac) * ((1 - xFrac) * src[i00 + c] + xFrac * src[i10 + c])
                            + yFrac * ((1 - xFrac) * src[i01 + c] + xFrac * src[i11 + c]);
                    dst[di + c] = v < 0 ? 0 : v > 255 ? 255 : v;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 3: Bicubic (4x4) ----
    function bicubic(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        // Precompute weights for each phase
        function cubicWeight(t) {
            const absT = Math.abs(t);
            if (absT < 1) return absT * absT * (1.5 * absT - 2.5) + 1;
            if (absT < 2) return absT * (absT * (-0.5 * absT + 2.5) - 4) + 2;
            return 0;
        }

        // 1D convolution first (horizontally)
        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = cubicWeight(k - fx);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        // Then vertically
        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = cubicWeight(k - fy);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 4: Lanczos-3 (6x6 kernel) ----
    function lanczos3(imgData, targetW, targetH) {
        const a = 3;
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        // Horizontal pass
        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = lanczos(k - fx, a);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        // Vertical pass
        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = lanczos(k - fy, a);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 5: Lanczos-4 (8x8 kernel) ----
    function lanczos4(imgData, targetW, targetH) {
        const a = 4;
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = lanczos(k - fx, a);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = lanczos(k - fy, a);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 6: Catmull-Rom (4x4) ----
    function catmullRom(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = cubicCatmullRom(k - fx);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = cubicCatmullRom(k - fy);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 7: Mitchell-Netravali ----
    function mitchell(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = cubicMitchell(k - fx);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = cubicMitchell(k - fy);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 8: B-Spline ----
    function bspline(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = cubicBSpline(k - fx);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -1; k <= 2; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = cubicBSpline(k - fy);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 9: Box Filter ----
    function box(imgData, targetW, targetH) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;
        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        const scaleX = srcW / targetW;
        const scaleY = srcH / targetH;

        for (let y = 0; y < targetH; y++) {
            const yStart = Math.floor(y * scaleY);
            const yEnd = Math.min(Math.ceil((y + 1) * scaleY), srcH);
            const yCnt = yEnd - yStart;

            for (let x = 0; x < targetW; x++) {
                const xStart = Math.floor(x * scaleX);
                const xEnd = Math.min(Math.ceil((x + 1) * scaleX), srcW);
                const xCnt = xEnd - xStart;

                let r = 0, g = 0, b = 0, a = 0;
                const cnt = yCnt * xCnt;

                for (let iy = yStart; iy < yEnd; iy++) {
                    for (let ix = xStart; ix < xEnd; ix++) {
                        const idx = (iy * srcW + ix) * 4;
                        r += src[idx];
                        g += src[idx + 1];
                        b += src[idx + 2];
                        a += src[idx + 3];
                    }
                }

                const di = (y * targetW + x) * 4;
                dst[di] = r / cnt;
                dst[di + 1] = g / cnt;
                dst[di + 2] = b / cnt;
                dst[di + 3] = a / cnt;
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Method 10: Triangle (Linear) Filter ----
    function triangle(imgData, targetW, targetH) {
        function triWeight(t) {
            const absT = Math.abs(t);
            return absT < 1 ? 1 - absT : 0;
        }
        return genericFilter(imgData, targetW, targetH, triWeight, 1);
    }

    // ---- Method 11: Gaussian Filter ----
    function gaussian(imgData, targetW, targetH) {
        const sigma = 0.8;
        function gaussWeight(t) {
            return Math.exp(-t * t / (2 * sigma * sigma));
        }
        return genericFilter(imgData, targetW, targetH, gaussWeight, 3);
    }

    // Generic separable filter with given weight function and radius
    function genericFilter(imgData, targetW, targetH, weightFn, radius) {
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;

                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -radius; k <= radius; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = weightFn(k - fx);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;

            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -radius; k <= radius; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = weightFn(k - fy);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // ---- Additional interpolation methods ----

    // Lanczos-2 (4x4 kernel, faster than L3)
    function lanczos2(imgData, targetW, targetH) {
        const a = 2;
        const src = imgData.data;
        const srcW = imgData.width;
        const srcH = imgData.height;

        const temp = new Uint8ClampedArray(srcH * targetW * 4);
        for (let y = 0; y < srcH; y++) {
            for (let x = 0; x < targetW; x++) {
                const srcX = (x + 0.5) * (srcW / targetW) - 0.5;
                const cx = Math.floor(srcX);
                const fx = srcX - cx;
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const ix = clamp(cx + k, 0, srcW - 1);
                        const w = lanczos(k - fx, a);
                        if (w === 0) continue;
                        sum += src[(y * srcW + ix) * 4 + c] * w;
                        totalW += w;
                    }
                    temp[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }

        const dst = new Uint8ClampedArray(targetW * targetH * 4);
        for (let y = 0; y < targetH; y++) {
            const srcY = (y + 0.5) * (srcH / targetH) - 0.5;
            const cy = Math.floor(srcY);
            const fy = srcY - cy;
            for (let x = 0; x < targetW; x++) {
                const di = (y * targetW + x) * 4;
                for (let c = 0; c < 4; c++) {
                    let sum = 0, totalW = 0;
                    for (let k = -a + 1; k <= a; k++) {
                        const iy = clamp(cy + k, 0, srcH - 1);
                        const w = lanczos(k - fy, a);
                        if (w === 0) continue;
                        sum += temp[(iy * targetW + x) * 4 + c] * w;
                        totalW += w;
                    }
                    dst[di + c] = totalW > 0 ? clamp(sum / totalW, 0, 255) : 0;
                }
            }
        }
        return new ImageData(dst, targetW, targetH);
    }

    // Keys α=-1 (sharpest standard cubic, edge emphasis)
    function keysSharpestWeight(t) { return cubicKeys(t, -1.0); }

    function keysSharpest(imgData, targetW, targetH) {
        return genericFilter(imgData, targetW, targetH, keysSharpestWeight, 2);
    }

    // Pure sinc (no windowing) — very sharp, heavy ringing
    function sincWeight(t) {
        if (t === 0) return 1;
        const at = Math.abs(t);
        if (at >= 4) return 0;
        return Math.sin(Math.PI * t) / (Math.PI * t);
    }

    function sinc(imgData, targetW, targetH) {
        return genericFilter(imgData, targetW, targetH, sincWeight, 4);
    }

    // Windowed sinc helpers
    function makeWindowedSinc(windowFn, radius) {
        return function(t) {
            if (t === 0) return 1;
            const at = Math.abs(t);
            if (at >= radius) return 0;
            const st = Math.sin(Math.PI * t) / (Math.PI * t);
            return st * windowFn(at / radius);
        };
    }

    // Hann window: 0.5 + 0.5 * cos(πt)
    function hannWindow(x) { return 0.5 + 0.5 * Math.cos(Math.PI * x); }

    // Hamming window: 0.54 + 0.46 * cos(πt)
    function hammingWindow(x) { return 0.54 + 0.46 * Math.cos(Math.PI * x); }

    // Blackman window: 0.42 + 0.5 * cos(πt) + 0.08 * cos(2πt)
    function blackmanWindow(x) {
        return 0.42 + 0.5 * Math.cos(Math.PI * x) + 0.08 * Math.cos(2 * Math.PI * x);
    }

    // Kaiser window (beta = 4)
    function besselI0(x) {
        let sum = 1, term = 1, k = 0;
        const x2 = x * x / 4;
        while (term > 1e-10) {
            k++;
            term *= x2 / (k * k);
            sum += term;
        }
        return sum;
    }

    function kaiserWindow(x) {
        const beta = 4;
        if (Math.abs(x) >= 1) return 0;
        return besselI0(beta * Math.sqrt(1 - x * x)) / besselI0(beta);
    }

    const hannWeight = makeWindowedSinc(hannWindow, 4);
    const hammingWeight = makeWindowedSinc(hammingWindow, 4);
    const blackmanWeight = makeWindowedSinc(blackmanWindow, 4);
    const kaiserWeight = makeWindowedSinc(kaiserWindow, 4);

    function hann(imgData, targetW, targetH) { return genericFilter(imgData, targetW, targetH, hannWeight, 4); }
    function hamming(imgData, targetW, targetH) { return genericFilter(imgData, targetW, targetH, hammingWeight, 4); }
    function blackman(imgData, targetW, targetH) { return genericFilter(imgData, targetW, targetH, blackmanWeight, 4); }
    function kaiser(imgData, targetW, targetH) { return genericFilter(imgData, targetW, targetH, kaiserWeight, 4); }

    // Quadratic (B-spline degree 2)
    function quadraticWeight(t) {
        const at = Math.abs(t);
        const at2 = at * at;
        if (at < 0.5) return 0.75 - at2;
        if (at < 1.5) return 0.5 * (at - 1.5) * (at - 1.5);
        return 0;
    }

    function quadratic(imgData, targetW, targetH) {
        return genericFilter(imgData, targetW, targetH, quadraticWeight, 2);
    }

    // Keys cubic (generalized cubic with alpha parameter, alpha=-0.5 is sharp)
    function cubicKeys(t, alpha) {
        const at = Math.abs(t);
        const at2 = at * at;
        const at3 = at2 * at;
        if (at < 1) return (alpha + 2) * at3 - (alpha + 3) * at2 + 1;
        if (at < 2) return alpha * at3 - 5 * alpha * at2 + 8 * alpha * at - 4 * alpha;
        return 0;
    }

    function keysSharpWeight(t) { return cubicKeys(t, -0.5); }
    function keysSoftWeight(t) { return cubicKeys(t, -0.75); }

    function keysSharp(imgData, targetW, targetH) {
        return genericFilter(imgData, targetW, targetH, keysSharpWeight, 2);
    }

    function keysSoft(imgData, targetW, targetH) {
        return genericFilter(imgData, targetW, targetH, keysSoftWeight, 2);
    }

    // ---- Public API ----

    const METHODS = {
        'nearest': { fn: nearestNeighbor, name: 'Nearest Neighbor', abbr: 'NN', desc: 'Pixel-perfect, sharp edges, blocky' },
        'bilinear': { fn: bilinear, name: 'Bilinear', abbr: 'BL', desc: 'Smooth, basic interpolation' },
        'bicubic': { fn: bicubic, name: 'Bicubic', abbr: 'BC', desc: 'Sharpened, good balance' },
        'lanczos2': { fn: lanczos2, name: 'Lanczos-2', abbr: 'L2', desc: 'Fast lanczos, slight ringing (4x4)' },
        'lanczos3': { fn: lanczos3, name: 'Lanczos-3', abbr: 'L3', desc: 'High quality, slight ringing (6x6)' },
        'lanczos4': { fn: lanczos4, name: 'Lanczos-4', abbr: 'L4', desc: 'Very high quality, smooth (8x8)' },
        'catmullrom': { fn: catmullRom, name: 'Catmull-Rom', abbr: 'CR', desc: 'Sharp cubic, edge enhancement' },
        'mitchell': { fn: mitchell, name: 'Mitchell-Netravali', abbr: 'MN', desc: 'Soft cubic, no ringing' },
        'bspline': { fn: bspline, name: 'B-Spline', abbr: 'BS', desc: 'Very smooth, maximal blur' },
        'keyssharpest': { fn: keysSharpest, name: 'Keys Sharpest', abbr: 'KS', desc: 'Sharpest Keys cubic (α=-1), strong edge' },
        'keyssharp': { fn: keysSharp, name: 'Keys Sharp', abbr: 'KSh', desc: 'Sharp Keys cubic (α=-0.5)' },
        'keyssoft': { fn: keysSoft, name: 'Keys Soft', abbr: 'KF', desc: 'Soft Keys cubic (α=-0.75)' },
        'quadratic': { fn: quadratic, name: 'Quadratic', abbr: 'QD', desc: 'Degree-2 B-spline, fast' },
        'sinc': { fn: sinc, name: 'Sinc', abbr: 'SI', desc: 'Pure sinc, maximal sharpness, heavy ringing' },
        'hann': { fn: hann, name: 'Hann', abbr: 'HN', desc: 'Hann-windowed sinc, smooth' },
        'hamming': { fn: hamming, name: 'Hamming', abbr: 'HM', desc: 'Hamming-windowed sinc, balanced' },
        'blackman': { fn: blackman, name: 'Blackman', abbr: 'BM', desc: 'Blackman-windowed sinc, very smooth' },
        'kaiser': { fn: kaiser, name: 'Kaiser', abbr: 'KR', desc: 'Kaiser-windowed sinc (β=4), high quality' },
        'box': { fn: box, name: 'Box Filter', abbr: 'BX', desc: 'Area-based averaging' },
        'triangle': { fn: triangle, name: 'Triangle Filter', abbr: 'TR', desc: 'Linear tent filter' },
        'gaussian': { fn: gaussian, name: 'Gaussian', abbr: 'GA', desc: 'Gaussian-weighted, soft blur' }
    };

    function getMethodList() {
        return Object.keys(METHODS).map(key => ({
            id: key,
            ...METHODS[key]
        }));
    }

    function upscale(imgData, targetW, targetH, methodId) {
        const method = METHODS[methodId];
        if (!method) throw new Error(`Unknown method: ${methodId}`);
        return method.fn(imgData, targetW, targetH);
    }

    return {
        getMethodList,
        upscale,
        METHODS
    };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = TradUpscaler;
}
