const test=require('node:test');
const assert=require('node:assert/strict');
const {merge,deleteMedia}=require('../data-merge.js');
const base=()=>({
 songs:[{id:'song-1',title:'Test song'}],
 lessons:[{id:'lesson-1',date:'2026-11-01',recordings:[{id:'recording-a'}]}],
 assignments:[{id:'assignment-1',title:'Homework'}],
 practices:[{id:'practice-1',date:'2026-11-01',minutes:30,mediaIds:['recording-a']}],
 categories:[],
 dailyGoals:[{id:'plan-1:2026-11-01',date:'2026-11-01',sourceId:'plan-1',completed:true}],
 practicePlans:[{id:'plan-1',kind:'monthly-vocal',songId:'song-1',startDate:'2026-11-01',days:5,reviewRecordingId:'recording-a',updatedAt:100}],
 vocalPlanReports:[{id:'plan-outcome:plan-1',planId:'plan-1',songId:'song-1',created:150,updatedAt:150,
   completedDays:1,scheduledDays:5,completionRate:20,
   measurement:{before:35,after:25,beforeCount:1,afterCount:1,beforeIds:['recording-a'],afterIds:['recording-b']}}],
 monthlyGrowthReports:[{id:'monthly-growth:2026-10',month:'2026-10',metrics:[]}],
 monthlyAiReports:[{id:'monthly-ai:2026-10',month:'2026-10',note:'Saved coach feedback'}]
});
test('cloud merge retains existing lessons, practices, assignments and newly saved outcome reports',()=>{
 const device=base(),cloud=base();
 cloud.lessons.push({id:'lesson-2',date:'2026-11-04'});
 cloud.dailyGoals.push({id:'plan-1:2026-11-02',date:'2026-11-02',sourceId:'plan-1',completed:true});
 const {data}=merge(device,cloud);
 assert.equal(data.lessons.length,2);
 assert.equal(data.practices[0].minutes,30);
 assert.equal(data.assignments.length,1);
 assert.equal(data.dailyGoals.length,2);
 assert.equal(data.practicePlans.length,1);
 assert.equal(data.vocalPlanReports.length,1);
 assert.equal(data.monthlyGrowthReports.length,1);
 assert.equal(data.monthlyAiReports.length,1);
 assert.equal(data.vocalPlanReports[0].measurement.before,35);
});
test('newer cloud outcome wins conflict without losing unrelated local edits',()=>{
 const device=base(),cloud=base();
 device.practices[0].memo='Local reflection';device.practices[0].updatedAt=300;
 cloud.vocalPlanReports[0].completedDays=4;cloud.vocalPlanReports[0].updatedAt=400;
 const {data}=merge(device,cloud);
 assert.equal(data.practices[0].memo,'Local reflection');
 assert.equal(data.vocalPlanReports[0].completedDays,4);
 assert.equal(data.lessons[0].recordings[0].id,'recording-a');
});
test('deleting a recording removes dangling plan and report links but preserves measured snapshots',()=>{
 const local=base();
 deleteMedia(local,'recording-a');
 assert.equal(local.practicePlans[0].reviewRecordingId,'');
 assert.deepEqual(local.vocalPlanReports[0].measurement.beforeIds,[]);
 assert.deepEqual(local.vocalPlanReports[0].measurement.afterIds,['recording-b']);
 assert.equal(local.vocalPlanReports[0].measurement.before,35);
 assert.equal(local.vocalPlanReports[0].completionRate,20);
 assert.equal(local.lessons[0].recordings.length,0);
 assert.equal(local.practices[0].minutes,30);
});
test('cloud sync tombstone cannot revive deleted source audio references',()=>{
 const device=base(),cloud=base();
 deleteMedia(device,'recording-a');
 const {data}=merge(device,cloud);
 assert.equal(data.practicePlans[0].reviewRecordingId,'');
 assert.deepEqual(data.vocalPlanReports[0].measurement.beforeIds,[]);
 assert.ok(data.deleted.media.includes('recording-a'));
 assert.equal(data.vocalPlanReports[0].measurement.after,25);
});
test('duplicate synced report IDs resolve once, based on updatedAt',()=>{
 const device=base(),cloud=base();
 device.vocalPlanReports[0].updatedAt=250;device.vocalPlanReports[0].completionRate=60;
 cloud.vocalPlanReports[0].updatedAt=200;cloud.vocalPlanReports[0].completionRate=40;
 const {data}=merge(device,cloud);
 assert.equal(data.vocalPlanReports.length,1);
 assert.equal(data.vocalPlanReports[0].completionRate,60);
});
