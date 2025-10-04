PORT ?= 5500
ROOT ?= .
PYTHON ?=

ifeq ($(PYTHON),)
PYTHON := $(firstword $(foreach cmd,python python3 py,$(if $(shell command -v $(cmd) 2>/dev/null),$(cmd))))
endif

ifeq ($(PYTHON),)
$(error Could not find a Python interpreter (python, python3, py). Install Python or run `make serve PYTHON=/path/to/python`)
endif

.PHONY: serve
serve:
	@echo Serving $(ROOT) at http://localhost:$(PORT)
	@$(PYTHON) -m http.server $(PORT) --directory $(ROOT)