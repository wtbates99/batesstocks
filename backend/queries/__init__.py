"""
Query layer — focused, domain-scoped query modules.

Each module owns the SQL and Python logic for one terminal route/domain.
This keeps terminal_service.py as a thin coordination layer and lets us
benchmark, test, and cache each domain independently.
"""
