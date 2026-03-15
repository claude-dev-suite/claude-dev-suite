---
name: streamlit
description: |
  Streamlit Python web application framework. Covers session state,
  caching, layouts, widgets, multipage apps, and deployment.
  Use when building interactive Python data apps or dashboards.

  USE WHEN: user mentions "streamlit", "st.session_state", "st.cache_data",
  "streamlit app", "python dashboard", "python web app", "streamlit deploy",
  "streamlit form", "streamlit component"

  DO NOT USE FOR: FastAPI/Flask REST APIs, Django web apps, Jupyter notebooks
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Streamlit Core Knowledge

## Installation & Run

```bash
pip install streamlit
streamlit run app.py
streamlit run app.py --server.port 8080
```

## Core Concepts

### App Execution Model
Streamlit re-runs the entire script top-to-bottom on every user interaction. Use caching and session_state to avoid redundant work.

### Session State

```python
import streamlit as st

# Initialize (always check first)
if "data" not in st.session_state:
    st.session_state.data = []

# Read and write
st.session_state.data.append(item)
st.write(st.session_state.data)

# Callback pattern (preferred for widget interactions)
def on_submit():
    st.session_state.result = process(st.session_state.input_val)

st.text_input("Input", key="input_val")
st.button("Submit", on_click=on_submit)
```

### Caching

```python
# @st.cache_data — serializable return values (DataFrames, dicts, lists)
@st.cache_data(ttl=600)  # cache expires in 10 min
def load_dataset(path: str) -> pd.DataFrame:
    return pd.read_csv(path)

# @st.cache_resource — non-serializable (DB connections, ML models)
@st.cache_resource
def get_model():
    return load_ml_model("model.pkl")

# Clear cache programmatically
load_dataset.clear()
```

## Layout & Components

### Columns

```python
col1, col2 = st.columns(2)          # equal width
col1, col2, col3 = st.columns([3, 1, 1])  # weighted

with col1:
    st.metric("Revenue", "$12,345", delta="+5%")
with col2:
    st.image("logo.png")
```

### Tabs

```python
tab1, tab2, tab3 = st.tabs(["Overview", "Details", "Export"])
with tab1:
    show_overview()
with tab2:
    show_details()
```

### Sidebar

```python
with st.sidebar:
    selected = st.selectbox("Area", options=["11301", "11090", "27301"])
    date_range = st.date_input("Date range", value=(start, end))
```

### Expander

```python
with st.expander("Advanced Options", expanded=False):
    threshold = st.slider("Threshold", 0.0, 1.0, 0.5)
```

## Input Widgets

```python
# Text
name = st.text_input("Name", placeholder="Enter tag name")
text = st.text_area("Description", height=100)

# Numbers
n = st.number_input("Count", min_value=0, max_value=1000, value=10, step=1)
ratio = st.slider("Ratio", 0.0, 1.0, 0.5)

# Selection
choice = st.selectbox("Type", ["Motor", "Valve", "Analog"])
choices = st.multiselect("Areas", ["11301", "11090"])
flag = st.checkbox("Include alarms", value=True)
option = st.radio("Export format", ["CSV", "Excel", "JSON"])

# File upload
uploaded = st.file_uploader("Upload Excel", type=["xlsx", "xls"])
if uploaded:
    df = pd.read_excel(uploaded)
```

## Data Display

```python
# DataFrame with config
st.dataframe(
    df,
    column_config={
        "tag": st.column_config.TextColumn("Tag", width="medium"),
        "value": st.column_config.NumberColumn("Value", format="%.2f"),
    },
    hide_index=True,
    use_container_width=True,
)

# Metrics
st.metric(label="Total Tags", value=len(df), delta=f"+{new_count} new")

# Charts
st.line_chart(df.set_index("timestamp")[["value"]])
st.bar_chart(df.groupby("area")["count"].sum())

# Download button
csv = df.to_csv(index=False).encode("utf-8")
st.download_button("Download CSV", csv, "export.csv", "text/csv")
```

## Forms (batch input — single rerun on submit)

```python
with st.form("generate_form"):
    area = st.text_input("Area code")
    count = st.number_input("Instance count", min_value=1, value=1)
    submitted = st.form_submit_button("Generate")

if submitted:
    if not area:
        st.error("Area code is required")
    else:
        with st.spinner("Generating..."):
            result = generate_files(area, count)
        st.success(f"Generated {result.count} files")
```

## Progress & Status

```python
# Spinner
with st.spinner("Loading data..."):
    data = fetch_data()

# Progress bar
progress = st.progress(0, text="Starting...")
for i, item in enumerate(items):
    process(item)
    progress.progress((i + 1) / len(items), text=f"Processing {i+1}/{len(items)}")
progress.empty()

# Status messages
st.success("Operation completed")
st.error("Something went wrong")
st.warning("Check your input")
st.info("Processing in background")
```

## Multipage Apps

```python
# app.py (Streamlit 1.36+)
import streamlit as st

pg = st.navigation([
    st.Page("pages/overview.py", title="Overview", icon="📊"),
    st.Page("pages/generator.py", title="Generator", icon="⚙️"),
    st.Page("pages/export.py", title="Export", icon="📁"),
])
pg.run()
```

## Configuration

```toml
# .streamlit/config.toml
[server]
port = 8501
headless = true
maxUploadSize = 200  # MB

[theme]
primaryColor = "#1f77b4"
backgroundColor = "#ffffff"
secondaryBackgroundColor = "#f0f2f6"
textColor = "#31333f"
font = "sans serif"

[client]
toolbarMode = "viewer"
```

## Secrets

```toml
# .streamlit/secrets.toml (gitignored)
[api]
key = "..."
```

```python
key = st.secrets["api"]["key"]
# Or flat access
key = st.secrets.api.key
```

## Deployment (Docker)

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8501
CMD ["streamlit", "run", "app.py", "--server.headless=true", "--server.port=8501"]
```

## Testing Streamlit Apps

```python
# Use streamlit.testing.v1 (Streamlit >= 1.18)
from streamlit.testing.v1 import AppTest

def test_app():
    at = AppTest.from_file("app.py").run()
    assert not at.exception
    assert at.title[0].value == "My App"

def test_form_submission():
    at = AppTest.from_file("app.py").run()
    at.text_input[0].set_value("11301").run()
    at.button[0].click().run()
    assert at.success[0].value == "Generated 1 files"
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Heavy I/O on every rerun | `@st.cache_data` |
| Global mutable state | `st.session_state` |
| Business logic in UI script | Separate `services/` module |
| No `key=` on dynamic widgets | Always set `key=` |
| `st.rerun()` in loop | Use fragments or callbacks |
