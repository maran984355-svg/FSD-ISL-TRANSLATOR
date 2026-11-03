console.log('=== SIGNX CAPTIONS & SOUND ROUTER TEST ===\n');

try {
  const testUrl = 'http://localhost:3001/api/youtube/captions?id=21X5lGlDOfg';
  const res = await fetch(testUrl);
  console.log(`1. GET ${testUrl} -> Status: ${res.status}`);
  const data = await res.json();
  console.log(`   Response status: ${data.status}`);
  console.log(`   Video ID: ${data.videoId}`);
  console.log(`   Subtitles found count: ${data.count}`);
  if (data.subtitles && data.subtitles.length > 0) {
    console.log('   Sample subtitle cue:', data.subtitles[0]);
  }
  console.log('\n✓ Backend captions endpoint test completed successfully.');
} catch (e) {
  console.error('Test error:', e);
}
