# Tips / Tricks

**Simplify your workflow with aliases:**

```bash
# Set an alias in `~/.bashrc`
alias htmltopdf="docker run --rm -v $(pwd):/converted/ daniesy/htmlconverter htmlconverter "

# Reload
source ~/.bashrc

# Convert HTML to PDF
htmltopdf http://blog.arachnys.com/
```


**Suppress errors (e.g. `extension "RANDR" missing`):**

```bash
# Redirect errors to /dev/null
docker run --rm -v $(pwd):/converted/ daniesy/htmlconverter htmlconverter 2> /dev/null http://blog.arachnys.com/
```