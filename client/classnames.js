
export default (...args) => {
    let str = [];
    for (const arg of args) {
        if (typeof arg === 'string') {
            str.push(arg)
        }
        if (typeof arg === 'object') {
            for (const [key, value] of Object.entries(arg)) {
                if (value) {
                    str.push(key)
                }
            }
        }
    }
    return str.join(' ');
}