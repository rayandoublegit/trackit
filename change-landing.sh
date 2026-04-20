#!/bin/bash
# Usage: ./change-landing.sh myimage.jpg
if [ -z "$1" ]; then echo "Usage: ./change-landing.sh filename.jpg"; exit 1; fi
python3 -c "
import re, sys
f = open('src/app/globals.css', 'r'); c = f.read(); f.close()
c = re.sub(r\"url\('/images/[^']+'\) center center / cover no-repeat /\* LANDING_BG \*/\", \"url('/images/$1') center center / cover no-repeat /* LANDING_BG */\", c)
open('src/app/globals.css', 'w').write(c)
print('Landing changed to $1')
"
git add . && git commit -m "feat: landing bg → $1" && git push
