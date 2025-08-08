from flask import Flask, render_template
from visitor.routes import visitor_bp

app = Flask(__name__)

app.secret_key = '2325'

app.register_blueprint(visitor_bp, url_prefix='/visitor')

@app.route('/')
def index():
    return render_template('index.html')

if __name__ == '__main__':
    app.run(debug=True)
    # app.run(host='0.0.0.0', debug=True)