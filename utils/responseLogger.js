function responseTimeLogger(req, res, next) {
    const start = process.hrtime();
    res.on('finish', () => {
        const duration = process.hrtime(start);
        const durationInMs = (duration[0] * 1000 + duration[1] / 1e6).toFixed(2);
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${durationInMs} ms`);
    });
    next();
}

module.exports = responseTimeLogger;