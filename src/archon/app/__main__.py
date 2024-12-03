"""Used for debug purposes only.
So you can `python -m debugpy launch -m archon.app`, and interface with your IDE.
See https://fastapi.tiangolo.com/tutorial/debugging
"""

import logging
import logging.handlers
import uvicorn
import uvicorn.logging
from . import main

if __debug__:
    log_level = logging.DEBUG
else:
    log_level = logging.INFO
logging.getLogger().setLevel(log_level)
logging.basicConfig(level=log_level)
uvicorn.run(main.app, log_level=log_level)
