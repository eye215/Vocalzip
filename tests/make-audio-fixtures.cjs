const fs=require('node:fs'),{execFileSync}=require('node:child_process');
fs.mkdirSync('tests/fixtures',{recursive:true});
const target='tests/fixtures/dated-video.mp4';
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-metadata','creation_time=2024-02-29T15:30:00Z','-metadata','com.apple.quicktime.creationdate=2024-03-01T00:30:00+0900','-movflags','+faststart+use_metadata_tags',target],{stdio:'inherit'});
fs.copyFileSync(target,'tests/fixtures/dated-201MiB.mp4');
const fd=fs.openSync('tests/fixtures/dated-201MiB.mp4','r+'),size=fs.fstatSync(fd).size,full=201*1024*1024,header=Buffer.alloc(8);
header.writeUInt32BE(full-size);header.write('free',4);fs.writeSync(fd,header,0,8,size);fs.ftruncateSync(fd,full);fs.closeSync(fd);
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=320x240:rate=10','-t','1','-an','-c:v','libx264','tests/fixtures/silent-video.mp4'],{stdio:'inherit'});
