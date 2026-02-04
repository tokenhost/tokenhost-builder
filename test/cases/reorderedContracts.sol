
// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

contract FilComments_contract {

	uint public timestamp;
	address public sender;
	string public comment;
	string public photo;
	address public topic;

	constructor(address _sender, string memory _comment, string memory _photo, address _topic) {
		sender = _sender;
		timestamp = block.timestamp;
		comment = _comment;
		photo = _photo;
		topic = _topic;
	}

	struct FilCommentsData {
		address self;
		address sender;
		uint timestamp;
		string comment;
		address topic;
		string photo;
	}

	function getAll() external view returns (FilCommentsData memory) {
		return FilCommentsData({
			self: address(this),
			sender: sender,
			timestamp: timestamp,
			comment: comment,
			topic: topic,
			photo: photo
		});
	}

}

contract Topics_contract {

	uint public timestamp;
	address public sender;
	string public title;

	constructor(address _sender, string memory _title) {
		sender = _sender;
		timestamp = block.timestamp;
		title = _title;
	}

	struct TopicsData {
		address self;
		uint timestamp;
		address sender;
		string title;
	}

	function getAll() external view returns (TopicsData memory) {
		return TopicsData({
			self: address(this),
			timestamp: timestamp,
			sender: sender,
			title: title
		});
	}

}

contract App {

	address[] public FilComments_list;

	function get_FilComments_N(uint256 index) public view returns (FilComments_contract.FilCommentsData memory) {
		return FilComments_contract(FilComments_list[index]).getAll();
	}

	function get_first_FilComments_N(uint256 count, uint256 offset) public view returns (FilComments_contract.FilCommentsData[] memory) {
		require(offset + count <= FilComments_list.length, "Offset + count out of bounds");
		FilComments_contract.FilCommentsData[] memory results = new FilComments_contract.FilCommentsData[](count);
		for (uint i = 0; i < count; i++) {
			results[i] = FilComments_contract(FilComments_list[i + offset]).getAll();
		}
		return results;
	}

	function get_last_FilComments_N(uint256 count, uint256 offset) public view returns (FilComments_contract.FilCommentsData[] memory) {
		require(count + offset <= FilComments_list.length, "Count + offset out of bounds");
		FilComments_contract.FilCommentsData[] memory results = new FilComments_contract.FilCommentsData[](count);
		uint len = FilComments_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = FilComments_contract(FilComments_list[idx]).getAll();
		}
		return results;
	}

	function get_FilComments_list_length() public view returns (uint256) { return FilComments_list.length; }
	function get_FilComments_user_length(address user) public view returns (uint256) {
		return user_map[user].FilComments_list.length;
	}

	function get_FilComments_user_N(address user, uint256 index) public view returns (FilComments_contract.FilCommentsData memory) {
		return FilComments_contract(user_map[user].FilComments_list[index]).getAll();
	}

	function get_last_FilComments_user_N(address user, uint256 count, uint256 offset) public view returns (FilComments_contract.FilCommentsData[] memory) {
		require(count + offset <= user_map[user].FilComments_list.length, "Count + offset out of bounds");
		FilComments_contract.FilCommentsData[] memory results = new FilComments_contract.FilCommentsData[](count);
		uint len = user_map[user].FilComments_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = FilComments_contract(user_map[user].FilComments_list[idx]).getAll();
		}
		return results;
	}

	address[] public Topics_list;

	function get_Topics_N(uint256 index) public view returns (Topics_contract.TopicsData memory) {
		return Topics_contract(Topics_list[index]).getAll();
	}

	function get_first_Topics_N(uint256 count, uint256 offset) public view returns (Topics_contract.TopicsData[] memory) {
		require(offset + count <= Topics_list.length, "Offset + count out of bounds");
		Topics_contract.TopicsData[] memory results = new Topics_contract.TopicsData[](count);
		for (uint i = 0; i < count; i++) {
			results[i] = Topics_contract(Topics_list[i + offset]).getAll();
		}
		return results;
	}

	function get_last_Topics_N(uint256 count, uint256 offset) public view returns (Topics_contract.TopicsData[] memory) {
		require(count + offset <= Topics_list.length, "Count + offset out of bounds");
		Topics_contract.TopicsData[] memory results = new Topics_contract.TopicsData[](count);
		uint len = Topics_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = Topics_contract(Topics_list[idx]).getAll();
		}
		return results;
	}

	function get_Topics_list_length() public view returns (uint256) { return Topics_list.length; }
	function get_Topics_user_length(address user) public view returns (uint256) {
		return user_map[user].Topics_list.length;
	}

	function get_Topics_user_N(address user, uint256 index) public view returns (Topics_contract.TopicsData memory) {
		return Topics_contract(user_map[user].Topics_list[index]).getAll();
	}

	function get_last_Topics_user_N(address user, uint256 count, uint256 offset) public view returns (Topics_contract.TopicsData[] memory) {
		require(count + offset <= user_map[user].Topics_list.length, "Count + offset out of bounds");
		Topics_contract.TopicsData[] memory results = new Topics_contract.TopicsData[](count);
		uint len = user_map[user].Topics_list.length;
		for (uint i = 0; i < count; i++) {
			uint idx = len - i - offset - 1;
			results[i] = Topics_contract(user_map[user].Topics_list[idx]).getAll();
		}
		return results;
	}

	struct FilComments_Topics {
		bool exists;
		address[] FilComments_list;
	}
	mapping(address => FilComments_Topics) public FilComments_Topics_map;

	function get_length_FilComments_Topics_map(address hash) public view returns (uint256) {
		return FilComments_Topics_map[hash].FilComments_list.length;
	}

	function get_last_FilComments_Topics_map_N(address hash, uint256 count, uint256 offset) public view returns (FilComments_contract.FilCommentsData[] memory) {
		FilComments_contract.FilCommentsData[] memory results = new FilComments_contract.FilCommentsData[](count);
		for (uint i = 0; i < count; i++) {
			FilComments_contract instance = FilComments_contract(FilComments_Topics_map[hash].FilComments_list[FilComments_Topics_map[hash].FilComments_list.length - i - offset - 1]);
			results[i] = instance.getAll();
		}
		return results;
	}

	struct UserInfo {
		address owner;
		bool exists;
		address[] FilComments_list;
		uint256 FilComments_list_length;
		address[] Topics_list;
		uint256 Topics_list_length;
	}
	mapping(address => UserInfo) public user_map;
	address[] public UserInfoList;
	uint256 public UserInfoListLength;

	event NewFilComments(address indexed sender, address indexed contractAddress);

	function new_FilComments(string memory comment, string memory photo, address topic) public returns (address) {
		address mynew = address(new FilComments_contract({
			_sender : msg.sender,
			_comment : comment,
			_photo : photo,
			_topic : topic
		}));

		if(!FilComments_Topics_map[topic].exists) {
			FilComments_Topics_map[topic] = create_index_on_new_FilComments_Topics();
		}
		FilComments_Topics_map[topic].FilComments_list.push(mynew);

		if(!user_map[msg.sender].exists) {
			user_map[msg.sender] = create_user_on_new_FilComments(mynew);
		}
		user_map[msg.sender].FilComments_list.push(mynew);
		user_map[msg.sender].FilComments_list_length += 1;

		FilComments_list.push(mynew);
		// The length of FilComments_list is tracked by the array length

		emit NewFilComments(msg.sender, mynew);

		return mynew;
	}

	function create_user_on_new_FilComments(address addr) private returns (UserInfo memory) {
		address[] memory FilComments_list_ = new address[](0);
		address[] memory Topics_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			FilComments_list: FilComments_list_,
			FilComments_list_length: 0,
			Topics_list: Topics_list_,
			Topics_list_length: 0
		});
	}

	function create_index_on_new_FilComments_Topics() private pure returns (FilComments_Topics memory) {
		address[] memory tmp = new address[](0);
		return FilComments_Topics({exists: true, FilComments_list: tmp});
	}

	event NewTopics(address indexed sender, address indexed contractAddress);

	function new_Topics(string memory title) public returns (address) {
		address mynew = address(new Topics_contract({
			_sender : msg.sender,
			_title : title
		}));

		if(!user_map[msg.sender].exists) {
			user_map[msg.sender] = create_user_on_new_Topics(mynew);
		}
		user_map[msg.sender].Topics_list.push(mynew);
		user_map[msg.sender].Topics_list_length += 1;

		Topics_list.push(mynew);
		// The length of Topics_list is tracked by the array length

		emit NewTopics(msg.sender, mynew);

		return mynew;
	}

	function create_user_on_new_Topics(address addr) private returns (UserInfo memory) {
		address[] memory FilComments_list_ = new address[](0);
		address[] memory Topics_list_ = new address[](0);
		UserInfoList.push(addr);
		return UserInfo({
			exists: true,
			owner: addr,
			FilComments_list: FilComments_list_,
			FilComments_list_length: 0,
			Topics_list: Topics_list_,
			Topics_list_length: 0
		});
	}

}

