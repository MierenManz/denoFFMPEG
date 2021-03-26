import { FfmpegClass, Filters } from "../mod.ts";
const link =
  "https://cdn.discordapp.com/attachments/467182812382887936/800066821713297448/zZpCsH2uswobVSd2L2OplA4ad59L2arVxYtsFpJSEc3hqYB5DeyhfosH8VO4hgOUxi9oJHsRNHFsUQEV98au4w.png";
const overlay: Filters = {
  complex: true,
  filterName: "overlay",
  options: {
    x: "150",
  },
};
Deno.test({
  name: "complex videoFilter feature",
  fn: async () => {
    await new FfmpegClass({
      ffmpegDir: "ffmpeg",
      input: "./input.mp4",
    }).addInput(link).complexFilters(overlay).save("./ree.mp4");
  },
  sanitizeOps: true,
  sanitizeResources: true,
});
Deno.test({
  name: "complex videoFilter feature with progress",
  fn: async () => {
    const thing = new FfmpegClass({
      ffmpegDir: "ffmpeg",
      input: "./input.mp4",
    }).addInput(link).complexFilters(overlay).saveWithProgress("./ree.mp4");
    for await (const progress of thing) {
      console.log(progress);
    }
  },
  sanitizeOps: true,
  sanitizeResources: true,
});
