.PHONY: clean porcelain update geodata test serve-front serve serve-pdb build release

NEXT_VERSION ?= `python -m setuptools_scm --strip-dev`

clean:
	rm -rf src/archon/static/*
	rm -rf dist
	rm -rf .parcel-cache

porcelain:
	git diff --exit-code --quiet

update:
	cd "$$NVM_DIR" && git fetch --tags origin && git checkout `git describe --abbrev=0 --tags --match "v[0-9]*" $$(git rev-list --tags --max-count=1)`
	. "$$NVM_DIR/nvm.sh" && nvm install --lts
	npm install --include=dev
	npm update --include=dev
	uv sync --upgrade --all-extras

geodata:
	src/scripts/geonames.py

test:
	black --check src/archon
	ruff check src/archon
	pytest -vvs

serve-front:
	pm2 --name front start npm -- run front

serve: serve-front
	pm2 --name back start npm -- run back
	pm2 logs

serve-pdb: serve-front
	npm run back

build: clean
	NODE_ENV=production parcel build --no-scope-hoist
	git tag "${NEXT_VERSION}"
	python -m build

release: porcelain build
	git push origin "${NEXT_VERSION}"
	twine upload dist/* 
