import unittest

from check_repository_hygiene import path_violations


class RepositoryHygieneTests(unittest.TestCase):
    def test_forbidden_data_and_generated_paths_fail(self) -> None:
        paths = [
            "Read/private.pdf",
            "App/library/catalog.json",
            "App/app/node_modules/pkg/index.js",
            "App/runtime/readest/bin/readest.exe",
            "recovery.bundle",
        ]
        self.assertEqual(len(path_violations(paths)), len(paths))

    def test_code_and_vendored_upstream_fixtures_are_allowed(self) -> None:
        paths = [
            "App/app/app/page.tsx",
            "App/import/scripts/import_library.py",
            "App/forks/readest/LICENSE",
            "App/forks/readest/apps/readest-app/src/__tests__/fixtures/data/sample-alice.epub",
        ]
        self.assertEqual(path_violations(paths), [])


if __name__ == "__main__":
    unittest.main()
