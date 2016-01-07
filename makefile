LESS_FILES := $(shell find ./src/view/less -iname '*.less')
NWJS_PLATFORMS = $(shell ls ./nwjs)
RSYNC_OPT = --update -ravh --exclude '.*.swp'

print-%  : ; @echo $* = $($*)

all: allos

clean:
	rm -rf ./build

./buildcache:
	mkdir ./buildcache

./buildcache/node_modules: ./src/nwjs/package.json | ./buildcache
	cp ./src/nwjs/package.json ./buildcache/package.json
	cd ./buildcache/ && npm install
	rm ./buildcache/package.json

############ NWJS
./build/nwjs/linux-x64: ./src/nwjs/*
	mkdir -p $@
	rsync $(RSYNC_OPT) ./src/nwjs/* $@
	cp ./LabelMerge.jar $@/LabelMerge.jar
	cp ./skucustoms.js $@/skucustoms.js
	cp ./credentials.js $@/credentials.js
	cp -r ./nwjs/`basename $@`/* $@

./build/nwjs/osx-x64: ./src/nwjs/*
	mkdir -p $@
	rsync $(RSYNC_OPT) ./src/nwjs/* $@
	cp ./LabelMerge.jar $@/LabelMerge.jar
	cp ./skucustoms.js $@/skucustoms.js
	cp ./credentials.js $@/credentials.js
	cp -r ./nwjs/`basename $@`/* $@

./build/nwjs/win-x64: ./src/nwjs/*
	mkdir -p $@
	rsync $(RSYNC_OPT) ./src/nwjs/* $@
	cp ./LabelMerge.jar $@/LabelMerge.jar
	cp ./skucustoms.js $@/skucustoms.js
	cp ./credentials.js $@/credentials.js
	cp -r ./nwjs/`basename $@`/* $@

./build/nwjs/%/node_modules: ./build/nwjs/% ./buildcache/node_modules
	cp -r ./buildcache/node_modules `dirname $@`

./build/nwjs/%/view: ./src/view ./build/nwjs/%
	rsync $(RSYNC_OPT) ./src/view `dirname $@`

./build/nwjs/%/shared: ./src/shared ./build/nwjs/%
	rsync $(RSYNC_OPT) --update -ravh ./src/shared `dirname $@`

./build/nwjs/%/view/css/style.css: $(LESS_FILES)
	mkdir -p `dirname $@`
	lessc ./src/view/less/style.less > $@

linux-x64: ./build/nwjs/linux-x64 ./build/nwjs/linux-x64/view ./build/nwjs/linux-x64/shared ./build/nwjs/linux-x64/node_modules ./build/nwjs/linux-x64/view/css/style.css
osx-x64: ./build/nwjs/osx-x64 ./build/nwjs/osx-x64/view ./build/nwjs/osx-x64/shared ./build/nwjs/osx-x64/node_modules ./build/nwjs/osx-x64/view/css/style.css
win-x64: ./build/nwjs/win-x64 ./build/nwjs/win-x64/view ./build/nwjs/win-x64/shared ./build/nwjs/win-x64/node_modules ./build/nwjs/win-x64/view/css/style.css

allos: linux-x64 osx-x64 win-x64

win_zip: win-x64
	mv ./build/nwjs/win-x64 ./build/nwjs/OrdoroInterface
	cd ./build/nwjs && zip -r OrdoroInterface.zip OrdoroInterface

deploy: win_zip
	cp ./build/nwjs/OrdoroInterface.zip ~/Dropbox/Tinkering/

run: osx-x64
	open ./build/nwjs/osx-x64/nwjs.app
