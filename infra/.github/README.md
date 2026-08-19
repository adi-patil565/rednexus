# Workflows do not live here

Architecture.md section 5 places CI under `infra/.github/workflows/`,
which groups tidily with the other infrastructure — but GitHub only
scans `.github/workflows/` in the **repository root**. A workflow placed
here is never discovered and never runs, which is the worst failure mode
available to something whose entire job is catching failures: it looks
configured and silently is not.

The workflow is at:

    .github/workflows/ci.yml

This directory is kept only so the path in Architecture.md leads
somewhere that explains itself.
