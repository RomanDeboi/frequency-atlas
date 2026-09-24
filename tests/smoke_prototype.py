from pathlib import Path
import tempfile
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from playwright.sync_api import sync_playwright

project=Path(__file__).resolve().parents[1]
http=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(project)))
threading.Thread(target=http.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{http.server_port}/prototype.html'
errors=[]
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    page=browser.new_page(accept_downloads=True)
    page.on('pageerror',lambda error: errors.append(str(error)))
    page.goto(url)
    page.wait_for_function("document.querySelector('#storageStatus').textContent.includes('IndexedDB')",timeout=12000)
    initial=page.locator('#list .row').count()
    print('Initial records:', initial)
    assert initial>=6
    page.locator('#newBtn').click()
    page.locator('#entityName').fill('Lab test object')
    page.locator('#entityCategory').select_option('other')
    first=page.locator('.bandFormRow').first
    first.locator('[name=band]').fill('Band A')
    first.locator('[name=a]').fill('1200')
    first.locator('[name=b]').fill('1220')
    first.locator('[name=tags]').fill('test, spectrum')
    page.locator('#addBandRow').click()
    second=page.locator('.bandFormRow').nth(1)
    second.locator('[name=band]').fill('Band B')
    second.locator('[name=a]').fill('1400')
    second.locator('[name=b]').fill('1410')
    page.locator('#recordForm button[type=submit]').click()
    page.wait_for_function("document.querySelector('#editModal').classList.contains('hide')")
    page.locator('#search').fill('Lab test object')
    print('New related bands:', page.locator('#list .row').count())
    assert page.locator('#list .row').count()==2
    assert page.locator('#detail').get_by_text('Band B').count()>=1
    # Persistence after refresh.
    page.reload()
    page.wait_for_function("document.querySelector('#storageStatus').textContent.includes('IndexedDB')")
    page.locator('#dbTab').click()
    page.locator('#search').fill('Lab test object')
    assert page.locator('#list .row').count()==2
    print('Reload persisted records: yes')
    # Keywords, frequency, edit and screenshot upload.
    page.locator('#search').fill('1205')
    assert page.locator('#list .row').count()==1
    page.locator('#list .row').first.click()
    page.locator('#editBtn').click()
    page.locator('.bandFormRow [name=band]').fill('Band A edited')
    page.locator('#recordForm button[type=submit]').click()
    page.wait_for_function("document.querySelector('#editModal').classList.contains('hide')")
    assert page.get_by_text('Band A edited').count()>=1
    png=Path(tempfile.gettempdir())/'atlas-test.png'
    png.write_bytes(bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082'))
    page.locator('#imagesInput').set_input_files(str(png))
    page.wait_for_function("document.querySelectorAll('.imageTile').length===1")
    print('Screenshot upload:',page.locator('.imageTile').count())
    with page.expect_download() as info:
        page.locator('#exportBtn').click()
    download=info.value
    print('Export filename:',download.suggested_filename)
    # Invalid reversed bounds blocked.
    page.locator('#newFromDb').click()
    page.locator('#entityName').fill('Invalid')
    row=page.locator('.bandFormRow')
    row.locator('[name=band]').fill('Bad')
    row.locator('[name=a]').fill('3000')
    row.locator('[name=b]').fill('2000')
    page.locator('#recordForm button[type=submit]').click()
    assert 'початок' in page.locator('#formError').inner_text()
    print('Invalid frequency validation: yes')
    print('JS runtime errors:',errors)
    assert not errors, errors
    browser.close()
