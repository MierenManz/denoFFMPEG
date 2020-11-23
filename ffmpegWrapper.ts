/**
* Written & Maintained by only Christiaan 'MierenMans' van Boheemen
* Property of Christiaan van Boheemen
*/
import * as path from "https://deno.land/std@0.76.0/path/mod.ts";
import EventEmitter from "https://deno.land/std@0.78.0/node/events.ts";
import { Filters, Spawn } from "./interfaces.ts";

export class ffmpeg extends EventEmitter {
    private input:      string        =   "";
    private ffmpegDir:  string        =   "";
    private outputFile: string        =   "";
    private vbitrate:   Array<string> =   [];
    private abitrate:   Array<string> =   [];
    private filters:    Array<string> =   [];
    private aBR:        number        =    0;
    private vBR:        number        =    0;
    private fatalError: boolean       = true;

    public constructor(ffmpeg: Spawn, FE: boolean) {
        super();
        this.input = path.resolve(ffmpeg.input); // input file location, mag later worden gespecified
        this.ffmpegDir = path.resolve(ffmpeg.ffmpegDir); // mag ./dir/ffmpeg.exe zijn. mag later worden gespecified
        if (ffmpeg.fatalError === false) this.fatalError = false;
    }
    public setFfmpegPath(ffmpegDir: string): this {
        if (ffmpegDir) this.ffmpegDir = path.resolve(ffmpegDir);
        return this;
    }
    public inputFile(input: string): this {
        this.input = path.resolve(input);
        return this;
    }
    public save(output: string): void {
        this.outputFile = path.resolve(output);
        this.run();
        return;
    }
    public audioBitrate(bitrate: number): this {
        this.aBR = bitrate;
        this.abitrate = ["-b:a", String(bitrate)];
        return this;
    }
    public videoBitrate(bitrate: number|string, cbr: boolean = true): this {
        let brString: string = String(bitrate);
        this.vBR = Number.parseInt(brString);
        let bitR: number;
        switch (brString.charAt(brString.length-1).toLowerCase()) {
            case "mb/s":
            case "mbps":
            case "m":
                bitR = Number.parseInt(brString) * 1000000;
                break;
            case "kb/s":
            case "kbps":
            case "k":
            default:
                bitR = Number.parseInt(brString) * 1000;
                break;
        }
        this.vbitrate = ['-maxrate', String(bitR * 2), '-minrate', String(bitR / 4), "-b:v", String(bitR), '-bufsize', String(bitR * 5)];
        if (cbr == true) this.vbitrate = ['-maxrate', String(bitR), '-minrate', String(bitR), "-b:v", String(bitR), '-bufsize', '3M'];
        return this;
    }
    public addFilters(FilterArray: Array<Filters>): this {
        if (FilterArray) {
            FilterArray.forEach(obj => {
                switch (obj.filterName) {
                    case "yadif_cuda":
                    case "yadif":
                        this.filters.push(`${obj.filterName}=${obj.options.mode}:${obj.options.parity}:${obj.options.deint}`);
                        break;
                    case "drawtext":
                        this.filters.push(`drawtext="fontfile='${obj.options.fontfile}': fontcolor='${obj.options.fontcolor}': fontsize='${obj.options.fontsize}': x='${obj.options.x}': y='${obj.options.y}': shadowcolor='${obj.options.shadowcolor}': shadowx='${obj.options.shadowx}': shadowy='${obj.options.shadowy}': text='${obj.options.text}'`);
                        break;
                    // allow for custom filters. Should be a full line
                    default:
                        this.filters.push(obj.custom);
                        break;
                }
            })
        }
        return this;
    }
    private errorCheck(): void {
        let error: Array<string> = [];
        if (this.vbitrate && this.vBR !== 0 && Number.isNaN(this.vBR) == true) error.push("video Bitrate is NaN");
        if (this.abitrate && this.aBR !== 0 && Number.isNaN(this.aBR) == true) error.push("audio Bitrate is NaN");
        if (!this.input) error.push("No input specified!");
        if (!this.outputFile || this.outputFile == "") error.push("No output specified!");
        if (!this.ffmpegDir || this.ffmpegDir == "") error.push("No ffmpeg directory specified!");
        if (this.filters.join("").includes("undefined")) error.push("Filters were selected, but the field is incorrect or empty");
        if (error.join("") !== "") {
            let errors: string = error.join("\r\n");
            super.emit('error', errors);
            if (this.fatalError == true) throw new Error(errors);
        }
        return;
    }
    private formatting(): Array<string> {
        let temp = [this.ffmpegDir, "-i", this.input]; // Add required commands
        if (this.filters.length !== 0) temp.push("-vf", this.filters.join(",")); // Push all Filters
        if (this.abitrate.length !== 0) this.abitrate.forEach(x => {temp.push(x)}) // Push audio bitrate
        if (this.vbitrate.length !== 0) this.vbitrate.forEach(x => {temp.push(x)}); // Push video bitrate
        temp.push(this.outputFile);
        return temp;
    }
    private async run() {
        await this.errorCheck();
        let ree = await this.formatting()
        const p = Deno.run({
            cmd: ree,
            stderr: "piped",
            stdout: "piped"
        });
        let error: string = new TextDecoder("utf-8").decode(await p.stderrOutput());
        console.log(error)
        if (error.includes("Conversion failed!")) super.emit('error', error);
        let status = await p.status();
        await p.close();
        super.emit('end', status);
    }
}