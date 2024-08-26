import { YtdlCore } from "@ybd-project/ytdl-core";
import { YTDL_DownloadOptions } from "@ybd-project/ytdl-core/package/types/options";
import { opus as Opus, FFmpeg } from 'prism-media';
import { Readable, Duplex } from 'stream';

// ytdl events
const evn = [
    'info',
    'progress',
    'abort',
    'request',
    'response',
    'error',
    'redirect',
    'retry',
    'reconnect',
];

interface YTDLStreamOptions extends YTDL_DownloadOptions {
    seek?: number;
    encoderArgs?: string[];
    fmt?: string;
    opusEncoded?: boolean;
}

interface StreamOptions {
    seek?: number;
    encoderArgs?: string[];
    fmt?: string;
    opusEncoded?: boolean;
}

const StreamDownloader = (url: string, options?: YTDLStreamOptions) => {
    if (!url) {
        throw new Error('No input url provided');
    }
    if (typeof url !== 'string') {
        throw new SyntaxError(
            `input URL must be a string. Received ${typeof url}!`
        );
    }

    options ??= {};

    let FFmpegArgs: string[] = [
        '-analyzeduration',
        '0',
        '-loglevel',
        '0',
        '-f',
        `${typeof options.fmt === 'string' ? options.fmt : 's16le'}`,
        '-ar',
        '48000',
        '-ac',
        '2',
    ];

    if (!isNaN(options.seek)) {
        FFmpegArgs.unshift('-ss', options.seek.toString());
    }

    if (Array.isArray(options.encoderArgs)) {
        FFmpegArgs = FFmpegArgs.concat(options.encoderArgs);
    }

    const transcoder = new FFmpeg({
        args: FFmpegArgs,
    });

    const inputStream = YtdlCore.download(url, options);
    const output = inputStream.pipe(transcoder);
    if (options && !options.opusEncoded) {
        for (const event of evn) {
            inputStream.on(event, (...args) => output.emit(event, ...args));
        }
        inputStream.on('error', () => transcoder.destroy());
        output.on('close', () => transcoder.destroy());
        return output;
    }

    const opus = new Opus.Encoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
    });

    const outputStream = output.pipe(opus);

    output.on('error', (e) => outputStream.emit('error', e));

    for (const event of evn) {
        inputStream.on(event, (...args) => outputStream.emit(event, ...args));
    }

    outputStream.on('close', () => {
        transcoder.destroy();
        opus.destroy();
    });
    return outputStream;
};

/**
 * Creates arbitraryStream
 * @param stream Any readable stream source
 * @param options Stream options
 * @example const streamSource = "https://listen.moe/kpop/opus";
 * let stream = ytdl.arbitraryStream(streamSource, {
 *     encoderArgs: ["-af", "asetrate=44100*1.25"],
 *     fmt: "mp3"
 * });
 *
 * stream.pipe(fs.createWriteStream("kpop.mp3"));
 */
const arbitraryStream = (
    stream: string | Readable | Duplex,
    options?: StreamOptions
) => {
    if (!stream) {
        throw new Error('No stream source provided');
    }

    options ??= {};

    let FFmpegArgs: string[];
    if (typeof stream === 'string') {
        FFmpegArgs = [
            '-reconnect',
            '1',
            '-reconnect_streamed',
            '1',
            '-reconnect_delay_max',
            '5',
            '-i',
            stream,
            '-analyzeduration',
            '0',
            '-loglevel',
            '0',
            '-f',
            `${typeof options.fmt === 'string' ? options.fmt : 's16le'}`,
            '-ar',
            '48000',
            '-ac',
            '2',
        ];
    } else {
        FFmpegArgs = [
            '-analyzeduration',
            '0',
            '-loglevel',
            '0',
            '-f',
            `${typeof options.fmt === 'string' ? options.fmt : 's16le'}`,
            '-ar',
            '48000',
            '-ac',
            '2',
        ];
    }

    if (!isNaN(options.seek)) {
        FFmpegArgs.unshift('-ss', options.seek.toString());
    }

    if (Array.isArray(options.encoderArgs)) {
        FFmpegArgs = FFmpegArgs.concat(options.encoderArgs);
    }

    let transcoder = new FFmpeg({
        args: FFmpegArgs,
    });
    if (typeof stream !== 'string') {
        transcoder = stream.pipe(transcoder);
        stream.on('error', () => transcoder.destroy());
    }
    if (options && !options.opusEncoded) {
        transcoder.on('close', () => transcoder.destroy());
        return transcoder;
    }
    const opus = new Opus.Encoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
    });

    const outputStream = transcoder.pipe(opus);
    outputStream.on('close', () => {
        transcoder.destroy();
        opus.destroy();
    });
    return outputStream;
};

StreamDownloader.arbitraryStream = arbitraryStream;
StreamDownloader.version = require('../../package.json').version;

const DiscordYTDLCore = Object.assign(StreamDownloader, YtdlCore);

export = DiscordYTDLCore;