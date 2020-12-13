/**
* Written & Maintained by only Christiaan 'MierenMans' van Boheemen
* Property of Christiaan van Boheemen
*/
import { EventEmitter } from "https://deno.land/x/event@0.2.0/mod.ts";
import { readLines } from "https://deno.land/std@0.80.0/io/mod.ts";

type Events = {
    progress: [Progress];
    end: [Status];
    error: [string];
    data:[string];
    warn: [string];
    test: [string];
}

interface Filters {
    filterName: string;
    options: Record<string, number>
}
interface Spawn {
    ffmpegDir: string;
    niceness: number;
    source: string;
}
interface Status {
    success: boolean;
    code: number;
}
interface Progress {
    ETA: Date;
    percentage: number 
}

export class FfmpegCommand extends EventEmitter<Events> {
    #input:         string        =    "";
    #ffmpegDir:     string        =    "";
    #outputFile:    string        =    "";
    #niceness:      string        =    "";
    #vbitrate:      Array<string> =    [];
    #abitrate:      Array<string> =    [];
    #filters:       Array<string> =    [];
    #vidCodec:      Array<string> =    [];
    #audCodec:      Array<string> =    [];
    #stderr:        Array<string> =    [];
    #aBR:           number        =     0;
    #vBR:           number        =     0;
    #noAudio:       boolean       = false;
    #noVideo:       boolean       = false;
    #outputPipe:    boolean       = false;
    #inputIsURL:    boolean       = false;
    #Process!:      Deno.Process;
    public constructor(...param: Array<string|Spawn>) {
        super();
        param.forEach(x => {
            if (typeof x == null) return this;
            if (typeof x == "string") {
                if (x.includes('http')) {
                    this.#inputIsURL = true;
                }
                this.#input = x;
            }
            if (typeof x == "object") {
                Object.entries(x).forEach((j: Array<string>) => {
                    switch (j[0].toLowerCase()) {
                        case "source":
                            if (j[1].includes('http')) {
                                this.#inputIsURL = true;
                            }
                            this.#input = j[1];
                            break;
                        case "ffmpegdir":
                            this.#ffmpegDir = j[1];
                            break;
                        case "niceness":
                            if (Deno.build.os !== "windows") this.#niceness = j[1];
                            break;
                        default:
                            throw new Error('Option "' + j[0] + '" not found! Please remove')
                    }
                })
            }
        })
        return this;
    }
    public setFfmpegPath(ffmpegDir: string): this {
        if (ffmpegDir) this.#ffmpegDir = ffmpegDir;
        return this;
    }
    public inputFile(input: string): this {
        if (input) this.#input = input;
        return this;
    }
    public save(output: string): void {
        this.#outputFile = output;
        this.PRIVATE_METHOD_DONT_FUCKING_USE_run();
        return;
    }
    public noAudio(): this {
        this.#noAudio = true;
        return this;
    }
    public noVideo(): this {
        this.#noVideo = true;
        return this;
    }
    public pipe(): void {
        this.#outputPipe = true;
        this.PRIVATE_METHOD_DONT_FUCKING_USE_run();
        return;
    }
    public audioCodec(codec: string, options: Record<string, string>): this {
        this.#audCodec = ["-c:a", codec];
        if (codec == "" || codec == "null" || codec == "undefined") this.#audCodec = ["-c:a", "undefined"];
        if (options) Object.entries(options).forEach(x => this.#audCodec.push("-" + x[0], x[1]));
        return this;
    }
    public videoCodec(codec: string, options: Record<string, string>): this {
        this.#vidCodec = ["-c:v", codec];
        if (codec == "" || codec == "null" || codec == "undefined") this.#vidCodec = ["-c:v", "undefined"];
        if (options) Object.entries(options).forEach(x => this.#vidCodec.push("-" + x[0], x[1]));
        return this;
    }
    public audioBitrate(bitrate: number): this {
        this.#aBR = bitrate;
        this.#abitrate = ["-b:a", String(bitrate)];
        return this;
    }
    public videoBitrate(bitrate: number|string, cbr = true): this {
        const brString: string = String(bitrate);
        this.#vBR = parseInt(brString);
        let bitR: number;
        switch (brString.charAt(brString.length-1).toLowerCase()) {
            case "m":
                bitR = parseInt(brString) * 1000000;
                break;
            case "k":
            default:
                bitR = parseInt(brString) * 1000;
                break;
        }
        this.#vbitrate = ['-maxrate', String(bitR), '-minrate', String(bitR), "-b:v", String(bitR), '-bufsize', '3M'];
        if (cbr == false) this.#vbitrate = ['-maxrate', String(bitR * 2), '-minrate', String(bitR / 4), "-b:v", String(bitR), '-bufsize', String(bitR * 5)];
        return this;
    }
    public videoFilters(...Filters:Array<Filters>): this {
        Filters.forEach(x => {
            let temp: string = x.filterName + '="';
            Object.entries(x.options).forEach((j, i) => {
                if (i > 0) {temp += `: ${j[0]}='${j[1]}'`} else {temp += `${j[0]}='${j[1]}'`}
            })
            this.#filters.push(temp);
        })
        return this;
    }
    // everything after this comment is not intended to be used by a user.
    // Please don't try to use the methods or anything. Leave them be
    private async PRIVATE_METHOD_DONT_FUCKING_USE_getPipingData(): Promise<void> {
        for await (const line of readLines(this.#Process.stdout!)) {
            if (line) {
                super.emit('data', line)
            }
        }
    }
    private async PRIVATE_METHOD_DONT_FUCKING_USE_getProgress(): Promise<void> {
        let i = 1;
        let temp: Array<string> = [];
        let stderrStart = true;
        let timeS = NaN;
        let bitrate = NaN;
        let totalFrames = NaN;
        let encFound = 0;
        for await (const line of readLines(this.#Process.stderr!)) {
            if (line) {
                if (line.includes('encoder')) encFound++
                if (stderrStart === true) {
                    this.#stderr.push(line);
                    if ((i == 8 && !this.#inputIsURL) || (i == 7 && this.#inputIsURL)) {
                        const dur: string = line.trim().replaceAll("Duration: ", "");
                        const timeArr: Array<string> = dur.substr(0, dur.indexOf(",")).split(":");
                        timeS = ((Number.parseFloat(timeArr[0]) * 60 + parseFloat(timeArr[1])) * 60 + parseFloat(timeArr[2]));
                    }
                    if ((i == 9 && !this.#inputIsURL) || (i == 8 && this.#inputIsURL)) {
                        const string: string = line.trim();
                        bitrate = Number.parseFloat(string.substr(string.indexOf('], '), string.indexOf('kb/s,') - string.indexOf('], ')).replaceAll("], ", "").trim()); 
                        totalFrames = timeS * Number.parseFloat(string.substr(string.indexOf('kb/s,'), string.indexOf('fps') - string.indexOf('kb/s,')).replaceAll("kb/s,", "").trim());
                    }
                    if (line.includes("encoder") && (encFound > 3 || i >= 49)) {i = 0;stderrStart = false;}
                } else {
                    if (i < 13) temp.push(line);
                    if (i == 12) {
                        if (temp[0] == "progress=end") return;
                        let frame: number = Number.parseInt(temp[0].replaceAll("frame=", "").trim());
                        let fps: number = Number.parseFloat(temp[1].replaceAll("fps=", "").trim()) + 0.01;
                        if (temp[0].includes("frame=  ")) {
                            frame = Number.parseInt(temp[1].replaceAll("frame=", "").trim());
                            fps = Number.parseFloat(temp[2].replaceAll("fps=", "").trim()) + 0.01;
                        }
                        const progressOBJ: Progress = {
                            ETA: new Date(Date.now() + (totalFrames - frame) / fps * 1000),
                            percentage: Number.parseFloat((frame / totalFrames * 100).toFixed(2))
                        }
                        if (!Number.isNaN(fps) && !Number.isNaN(frame)) super.emit('progress', progressOBJ);
                        i = 0;
                        temp = [];
                    }
                }
                i++
            }
        }
    }
    private PRIVATE_METHOD_DONT_FUCKING_USE_clear(input: string): void {
        switch (input.toLowerCase()) {
            case "audio":
                this.#audCodec = [];
                this.#aBR = 0;
                this.#abitrate = [];
                break;
            case "video":
                this.#vidCodec = [];
                this.#vBR = 0;
                this.#vbitrate = [];
                this.#filters = [];
                break;
            default:
                throw new Error("tried to clear input. But no input was specified!\r\nIf you see this. Something is probably fucked")
        }
        return;
    }
    private PRIVATE_METHOD_DONT_FUCKING_USE_formatting(): Array<string> {
        const temp = [this.#ffmpegDir];
        if (this.#niceness !== "") temp.push("-n", this.#niceness);

        temp.push("-hide_banner", "-nostats","-y", "-i", this.#input)
        if (this.#noAudio) {
            temp.push("-an")
            this.PRIVATE_METHOD_DONT_FUCKING_USE_clear("audio");
        }
        if (this.#noVideo) {
            temp.push("-vn");
            this.PRIVATE_METHOD_DONT_FUCKING_USE_clear("video")
        }
        if (this.#audCodec.length > 0) this.#audCodec.forEach(x => temp.push(x))
        if (this.#vidCodec.length > 0) this.#vidCodec.forEach(x => temp.push(x))
        if (this.#filters.length > 0) temp.push("-vf", this.#filters.join(","))
        if (this.#abitrate.length > 0) this.#abitrate.forEach(x => temp.push(x))
        if (this.#vbitrate.length > 0) this.#vbitrate.forEach(x => temp.push(x))
        temp.push("-progress", "pipe:2")
        if (this.#outputPipe) {
            temp.push("-f", "h264", "pipe:1")
        } else {
            temp.push(this.#outputFile)
        }
        return temp;
    }
    private PRIVATE_METHOD_DONT_FUCKING_USE_errorCheck(): void {
        const error: Array<string> = [];
        if (this.#audCodec.length > 0 && (this.#audCodec.join("").includes("undefined") || this.#audCodec.includes("null"))) {error.push("one or more audio codec options are undefined")}
        if (this.#vidCodec.length > 0 && (this.#vidCodec.join("").includes("undefined") || this.#vidCodec.includes("null"))) {error.push("one or more video codec options are undefined")}
        if (this.#vbitrate.length > 0 && (this.#vBR == 0 || Number.isNaN(this.#vBR) == true)) {error.push("video Bitrate is NaN")}
        if (this.#abitrate.length > 0 && (this.#aBR == 0 || Number.isNaN(this.#aBR) == true)) {error.push("audio Bitrate is NaN")}
        if (!this.#input) {error.push("No input specified!")}
        if ((!this.#outputFile || this.#outputFile == "") && !this.#outputPipe) {error.push("No output specified!")}
        if (!this.#ffmpegDir || this.#ffmpegDir == "") {error.push("No ffmpeg directory specified!")}
        if (this.#filters.length > 0 && this.#filters.join("").includes("undefined")) {error.push("Filters were selected, but the field is incorrect or empty")}
        if (error.join("") !== "") {
            const errors: string = error.join("\r\n");
            super.emit('error', errors);
        }
        return;
    }
    private async PRIVATE_METHOD_DONT_FUCKING_USE_run(): Promise<void> {
        await this.PRIVATE_METHOD_DONT_FUCKING_USE_errorCheck();
        this.#Process = Deno.run({
            cmd: await this.PRIVATE_METHOD_DONT_FUCKING_USE_formatting(),
            stderr: "piped",
            stdout: "piped"
        });
        if (this.#outputPipe) this.PRIVATE_METHOD_DONT_FUCKING_USE_getPipingData();
        this.PRIVATE_METHOD_DONT_FUCKING_USE_getProgress();
        const status = await this.#Process.status();
        await this.#Process.close();
        if (status.success == false) super.emit('error', this.#stderr.join('\r\n'));
        super.emit('end', status);
    }
}

export default function ffmpeg(...param: Array<string|Spawn>): FfmpegCommand {
    return new FfmpegCommand(param);
}