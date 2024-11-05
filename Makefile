.PHONY: clean porcelain update geodata test serve build release

NEXT_VERSION = `python -m setuptools_scm --strip-dev`

clean:
	rm src/archon/static/*
	rm -rf dist

porcelain:
	git diff --exit-code --quiet

update:
	npm install --include=dev
	npm update --include=dev
	pip install --upgrade --upgrade-strategy eager -e ".[dev]"

geodata:
	src/scripts/geonames.py

test:
	black --check src/archon
	ruff check src/archon

serve:
	pm2 --name front start npm -- run front
	pm2 --name back start npm -- run back

build: clean
	parcel build
	python -m build

release: porcelain build
	git tag "${NEXT_VERSION}"
	git push origin "${NEXT_VERSION}"
	twine upload -r test-pypi dist/*
	twine upload dist/* 
