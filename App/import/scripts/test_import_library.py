import unittest

import import_library


class ImportLibraryTests(unittest.TestCase):
    def test_safe_slug_handles_windows_names_and_punctuation(self) -> None:
        self.assertEqual(
            import_library.safe_slug("The Lord of the Rings: The Fellowship of the Ring"),
            "The-Lord-of-the-Rings-The-Fellowship-of-the-Ring",
        )
        self.assertEqual(import_library.safe_slug("CON"), "Item-CON")
        self.assertEqual(import_library.safe_slug(" : ? "), "Untitled")

    def test_duplicate_titles_map_by_exact_properties(self) -> None:
        rows = [
            {"Show": "Life", "Added From": "Tiktok"},
            {"Show": "Life", "Added From": "Instagram"},
        ]
        pages = [
            {"title": "Life", "page_properties": {"Added From": "Instagram"}},
            {"title": "Life", "page_properties": {"Added From": "Tiktok"}},
        ]
        mapped, review = import_library.map_rows_to_pages(
            rows, pages, "Show", ["Added From"]
        )
        self.assertEqual(review, [])
        self.assertEqual([row["Added From"] for _, row, _ in mapped], ["Tiktok", "Instagram"])
        self.assertEqual(
            [page["page_properties"]["Added From"] for _, _, page in mapped],
            ["Tiktok", "Instagram"],
        )

    def test_identical_duplicate_records_are_blocked_as_ambiguous(self) -> None:
        rows = [{"Show": "Same", "Kind": "Movie"}] * 2
        pages = [
            {"title": "Same", "page_properties": {"Kind": "Movie"}},
            {"title": "Same", "page_properties": {"Kind": "Movie"}},
        ]
        mapped, review = import_library.map_rows_to_pages(rows, pages, "Show", ["Kind"])
        self.assertEqual(mapped, [])
        self.assertEqual(len(review), 1)

    def test_markdown_links_allow_parentheses_in_local_paths(self) -> None:
        text = "![Poster](Anyone%20But%20You%20(2023)/image.png)"
        links = import_library.iter_markdown_links(text)
        self.assertEqual(
            links[0]["target"], "Anyone%20But%20You%20(2023)/image.png"
        )
        self.assertEqual(
            import_library.rewrite_markdown_links(
                text, {links[0]["target"]: "./media/001-image.png"}
            ),
            "![Poster](./media/001-image.png)",
        )


if __name__ == "__main__":
    unittest.main()
