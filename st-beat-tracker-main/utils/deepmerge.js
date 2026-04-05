// utils/deepmerge.js

/**
 * 检查一个值是否为纯粹的对象（而不是数组、null等）。
 * @param {any} item - 要检查的值。
 * @returns {boolean} - 如果是纯对象则返回true。
 */
function isObject(item) {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * 深度合并一个或多个源对象的属性到目标对象中。
 * @param {object} target - 目标对象。属性将被合并到此对象的一个新副本中。
 * @param {...object} sources - 一个或多个源对象。
 * @returns {object} - 一个包含所有合并后属性的新对象。
 */
export function deepmerge(target, ...sources) {
    // 如果没有源对象，直接返回目标对象的浅拷贝
    if (!sources.length) {
        return { ...target };
    }

    // 将目标对象作为合并的基础
    const output = { ...target };

    // 遍历每一个源对象
    sources.forEach(source => {
        // 确保源是一个有效的对象
        if (isObject(source)) {
            // 遍历源对象的每一个键
            for (const key in source) {
                // 【安全检查】防止原型链污染
                if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                    continue;
                }

                // 如果目标和源中对应键的值都是对象，则进行递归合并
                if (isObject(source[key]) && key in output && isObject(output[key])) {
                    output[key] = deepmerge(output[key], source[key]);
                }
                // 否则，直接将源对象的值赋给输出对象
                else {
                    output[key] = source[key];
                }
            }
        }
    });

    return output;
}