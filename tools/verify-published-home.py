import hashlib, time, urllib.request
expected = {"design-system/Vocalzip_Floating_Record_Home.html":"b4ad1520615f1cae216393239679657779389d06","design-system/student-home-app.js":"c9cf8a6645f37d11fe011cb3b9180ac10b0914b7","design-system/student-home-fonts.css":"c639e0041e202a7c6e13e71a0fa4414509c74cf8","design-system/student-home-html.js":"4077058f17b3f45a6241c6296787452bb3d31ff5","design-system/student-home-shell.css":"129b5ab9cf4e26244bbfadea9b432e5f4736faeb","index.html":"a1dc58cc61c4543815f81a8403b8a4594b17d0ab"}
base = "https://vocalzip.yullul.com/"
for attempt in range(1, 7):
    try:
        for path, wanted in expected.items():
            url = base + path + "?release=e2be5d341501&check=" + str(attempt)
            request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "User-Agent": "Vocalzip-public-release-check"})
            with urllib.request.urlopen(request, timeout=20) as response:
                if response.status != 200:
                    raise RuntimeError(path + " HTTP " + str(response.status))
                data = response.read()
            actual = hashlib.sha1(("blob " + str(len(data)) + "\0").encode() + data).hexdigest()
            if actual != wanted:
                raise RuntimeError(path + " differs from merged commit: " + actual)
            print("MATCH", path, actual, flush=True)
        print("HOME_RELEASE_PUBLIC_FILES_VERIFIED", flush=True)
        break
    except Exception as error:
        print("Attempt", attempt, str(error), flush=True)
        if attempt == 6:
            raise
        time.sleep(10)
