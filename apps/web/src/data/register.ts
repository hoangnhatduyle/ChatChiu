// Importing this file declares every write (defineWrite runs at import time). AppDataProvider imports it,
// so every client knows every write before a queued one is restored: a write defined in a lazily loaded
// module would be "unresolved" after a reload.
import './ai'
import './inventory'
import './meals'
import './preferences'
import './push'
import './recipes'
import './shopping'
import './stats'
import './waste'
