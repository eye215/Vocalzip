const fs=require('node:fs'),{execFileSync}=require('node:child_process');
fs.mkdirSync('tests/fixtures',{recursive:true});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','lavfi','-i','testsrc2=size=1280x720:rate=24','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','20','-c:v','libx264','-preset','ultrafast','-b:v','6M','-maxrate','6M','-bufsize','12M','-c:a','aac','-b:a','192k','-metadata','creation_time=2024-02-29T15:30:00Z','-movflags','+faststart','tests/fixtures/photos-interleaved.mp4'],{stdio:'inherit'});
if(fs.statSync('tests/fixtures/photos-interleaved.mp4').size<8*1024*1024)throw Error('Fixture must exceed the parser cache');
