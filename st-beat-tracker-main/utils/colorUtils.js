// utils/colorUtils.js 

/**
 * [V2.0 - 逻辑修正版] 将 0-100 的好感度值映射到“蓝 -> 绿 -> 橙 -> 红”的色彩曲线上。
 * @param {number} value 好感度值。
 * @returns {string} 完整的HSL颜色字符串。
 */
export function mapValueToHue(value) {
    // 确保 value 在 0-100 之间
    const clampedValue = Math.max(0, Math.min(100, value));
    
    let hue;
    const saturation = 95;
    const lightness = 65;

    // 我们将整个色谱分为三段：
    // 0-50: 从蓝色(210)过渡到绿色(120)
    // 50-85: 从绿色(120)过渡到橙色(35)
    // 85-100: 从橙色(35)过渡到红色(0/360)

    if (clampedValue <= 50) {
        // 0 -> 210 (蓝), 50 -> 120 (绿)
        hue = 210 - (clampedValue / 50) * (210 - 120);
    } else if (clampedValue <= 85) {
        // 50 -> 120 (绿), 85 -> 35 (橙)
        hue = 120 - ((clampedValue - 50) / 35) * (120 - 35);
    } else {
        // 85 -> 35 (橙), 100 -> 0 (红)
        hue = 35 - ((clampedValue - 85) / 15) * 35;
    }
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}