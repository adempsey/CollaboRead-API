var React = require('react');

module.exports = Lecture = React.createClass({
    render: function(){
        var lecture = this.props.lecture;
        return(
            <p>{lecture.name}</p>
        )
    }
});
