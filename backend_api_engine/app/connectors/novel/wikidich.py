from typing import Optional

import httpx

from app.connectors.novel.metruyenchu import MetruyenchuConnector


class WikidichConnector(MetruyenchuConnector):
    """
    Public HTML connector for the current Wikidich template.

    Wikidich and MeTruyenChu currently expose the same public story/list/chapter
    layout. Inheriting the bounded parser keeps their selectors and access-gate
    behavior consistent without sharing cookies or attempting authenticated
    endpoints.
    """

    source_id = "wikidich"
    source_name = "Wikidich"
    base_url = "https://wikidich.vn"

    def __init__(
        self,
        base_url: Optional[str] = None,
        client: Optional[httpx.AsyncClient] = None,
        timeout: float = 15.0,
    ):
        super().__init__(base_url=base_url, client=client, timeout=timeout)
