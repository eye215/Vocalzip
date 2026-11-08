import hashlib, time, urllib.request
expected = {"app/scores.js":"4417c4b54322c4f83432001addcb01073b0158fe","app/views-main.js":"3c7ce46bdb153ad38817a41c2600510612918192","design-system/Vocalzip_Floating_Record_Home.html":"b4ad1520615f1cae216393239679657779389d06","design-system/student-home-app.js":"92c4307fde889247dbfcf194598c3ac7039e5163","design-system/student-home-html.js":"a0d327b453486c75f792a408988c915b17248d03","design-system/student-home-shell.css":"03102444561d3e00c34a80b0aacaf163e597f5f5","index.html":"5b9129d7637d4da54d237185bf628d6466f7a2ee"}
base = "https://vocalzip.yullul.com/"
for attempt in range(1, 13):
    try:
        for path, wanted in expected.items():
            request = urllib.request.Request(base + path + "?release=07b6ddb841b9&check=" + str(attempt), headers={"Cache-Control":"no-cache","User-Agent":"Vocalzip-public-release-check"})
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status != 200:
                    raise RuntimeError(path + " HTTP " + str(response.status))
                data = response.read()
            actual = hashlib.sha1(("blob " + str(len(data)) + "\0").encode() + data).hexdigest()
            if actual != wanted:
                raise RuntimeError(path + " differs from released file: " + actual)
            print("MATCH", path, actual, flush=True)
        print("RECORDING_SAFETY_PUBLIC_FILES_VERIFIED", flush=True)
        break
    except Exception as error:
        print("Attempt", attempt, str(error), flush=True)
        if attempt == 12:
            raise
        time.sleep(10)
