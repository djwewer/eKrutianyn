import sys, pathlib
d = pathlib.Path(__file__).parent
css = (d/'shared.css').read_text(); js = (d/'shared.js').read_text()
for name in sys.argv[1:]:
    src = (d/name).read_text()
    out = src.replace('/*SHARED_CSS*/', css).replace('/*SHARED_JS*/', js)
    if '/*APP_JS*/' in out: out = out.replace('/*APP_JS*/', (d/'app.js').read_text())
    if '/*PROBY_JSON*/' in out: out = out.replace('/*PROBY_JSON*/', (d/'proby-mini.json').read_text())
    assert '/*SHARED' not in out and '/*APP_JS' not in out and '/*PROBY' not in out, name
    (d/'out'/name).write_text(out)
    print('built', name, len(out)//1024, 'KB')
