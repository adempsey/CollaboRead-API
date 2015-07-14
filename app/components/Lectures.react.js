var React = require('react');
var Lecture = require('./Lecture.react.js');

module.exports = Lectures = React.createClass({
    render: function(){
        var content = this.props.lectures.map(function(lecture) {
            return (
                <Lecture key={lecture.name} lecture={lecture}/>
            )
        });

        return (
            <ul className="lectures">{content}</ul>
        )
    }
});
