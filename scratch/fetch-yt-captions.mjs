async function main() {
  const res = await fetch('https://www.youtube.com/watch?v=km-iUPTYFvk', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });
  const html = await res.text();
  const m = html.match(/captionTracks":(\[.*?\])/);
  if (m) {
    const tracks = JSON.parse(m[1]);
    const url = tracks[0].baseUrl;
    const cRes = await fetch(url);
    const xml = await cRes.text();
    console.log('XML length:', xml.length);
    console.log('XML content sample:');
    console.log(xml.substring(0, 1500));
  }
}
main().catch(console.error);
